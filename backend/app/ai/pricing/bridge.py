"""
Bridge: the tested price engine, in the shape the HTTP API already speaks.

`engine.py` works in whole rupees and knows nothing about HTTP. `app/schemas.py` speaks
paise and Pydantic. This module is the only place the two meet, so the engine stays
free of API concerns and the routers stay free of pricing logic.

## Money units -- a decision the team has now made by shipping

`AI_INTERFACE_CONTRACTS.md` says money moves "in integer paise where possible, or
decimal INR... Choose one before implementation." Nobody formally chose, but
`backend_branch` shipped `material_cost_paise`, `floor_amount_paise` and the rest, and
the frontend reads those names. So the wire format is paise, and this file converts.
The contract document should be updated to record that, since a decision made by
shipping is still a decision.

Rupee granularity inside the engine is not a rounding shortcut. State minimum-wage
notifications are published as whole rupees per day; a floor carried to the paisa would
be precision the source does not have.

## What this fixes relative to the legacy path

`skill_level` is a real lookup key here, not a field that is accepted and discarded.
The legacy service returns the same wage for unskilled and highly_skilled alike, which
makes the deck's "state statutory *skilled* wage" claim untrue in the one place it is
computed. And comparables are honoured with the asymmetry that is the whole point:
they may lift the band, never lower it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable, Sequence

from .. import config
from .engine import (
    InvalidPricingInput,
    PriceBand,
    PricingEngine,
    WageRateUnavailable,
)

CALCULATION_VERSION = "2.0.0-deterministic"

_TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "taxonomy" / "craft_taxonomy.json"

# A wage table whose own metadata says it is a fixture must never produce a response
# that looks sourced. This marker is copied into `wage_source.notification_ref` so the
# disclosure travels with the number, all the way to the screen.
_DEMO_MARKER = "DEMO-FIXTURE"


def paise_to_inr(paise: int | float) -> float:
    return float(paise) / 100.0


def inr_to_paise(inr: int | float) -> int:
    return int(round(float(inr) * 100))


def load_engine(wage_table_path: Path | None = None) -> PricingEngine:
    """Build an engine from the configured wage table.

    Reads on every call rather than caching at import. The table is the one file an
    operator edits without restarting a worker, and a cached empty table would keep
    refusing long after the rates were added.
    """
    path = Path(wage_table_path or config.wage_table_path())
    wage_table = json.loads(path.read_text(encoding="utf-8"))
    taxonomy = json.loads(_TAXONOMY_PATH.read_text(encoding="utf-8"))
    return PricingEngine(wage_table=wage_table, taxonomy=taxonomy)


def wage_table_is_demo(wage_table: dict) -> bool:
    return bool(wage_table.get("is_demo_fixture"))


def wage_source_fields(wage_table: dict, state_code: str) -> dict[str, str]:
    """The provenance block for the response, honest about fixtures.

    `WageSourceInfo` requires non-null strings, so a missing reference becomes explicit
    text rather than an empty string. "unspecified" on a screen is a prompt to go and
    find the notification; "" reads as a rendering bug and gets ignored.
    """
    entry = (wage_table.get("states") or {}).get(state_code.upper(), {})
    ref = entry.get("notification_ref") or "unspecified"
    url = entry.get("source_url") or "unspecified"
    effective = entry.get("effective_from") or "unspecified"

    if wage_table_is_demo(wage_table) and _DEMO_MARKER not in ref:
        ref = f"{_DEMO_MARKER}-{ref}"

    return {
        "state_code": state_code.upper(),
        "notification_ref": ref,
        "effective_from": effective,
        "source_url": url,
    }


def band_to_paise(band: PriceBand) -> dict[str, int]:
    return {
        "floor_amount_paise": inr_to_paise(band.floor),
        "recommended_low_paise": inr_to_paise(band.fair),
        "recommended_high_paise": inr_to_paise(band.ceiling),
    }


def explain(band: PriceBand, *, is_demo: bool, notification_ref: str) -> str:
    """The sentence read to the artisan, plus a disclosure when the rate is a fixture.

    The disclosure is part of the explanation string rather than a separate field on
    purpose: a separate field can be dropped by a client that does not know about it,
    and the one place this must not go missing is the screen showing the number.
    """
    text = band.explain()
    if is_demo:
        return (
            text
            + " NOTE: this calculation used a demonstration wage rate "
            f"({notification_ref}), not a government notification. It is not a real price."
        )
    return text + f" Wage rate source: {notification_ref}."


def calculate(
    *,
    material_cost_paise: int,
    labour_hours: float,
    skill_level: str,
    state_code: str,
    techniques: Sequence[str] = (),
    comparables_paise: Iterable[int] = (),
    wage_table_path: Path | None = None,
) -> dict:
    """Price a listing, or raise.

    Returns a plain dict matching `schemas.PriceResult` so this module stays free of
    any dependency on the router layer.

    Raises `WageRateUnavailable` when no rate is on file. That is the designed
    behaviour, not a gap: a floor computed from a guessed rate launders underpayment
    through an official-looking number, and it is the one failure mode the artisan
    cannot detect.
    """
    path = Path(wage_table_path or config.wage_table_path())
    wage_table = json.loads(path.read_text(encoding="utf-8"))
    engine = load_engine(path)

    band = engine.price(
        labour_hours=float(labour_hours),
        skill_level=skill_level,
        state_code=state_code,
        material_cost_inr=paise_to_inr(material_cost_paise),
        techniques=tuple(techniques),
        comparables_inr=[paise_to_inr(c) for c in comparables_paise if c],
    )

    is_demo = wage_table_is_demo(wage_table)
    source = wage_source_fields(wage_table, state_code)
    hourly_inr = (band.wage_rate_per_day or 0.0) / float(wage_table.get("hours_per_day", 8))

    return {
        "calculation_version": CALCULATION_VERSION,
        "status": "available",
        "currency": "INR",
        "wage_source": source,
        "inputs": {
            "material_cost_paise": int(material_cost_paise),
            "labour_hours": float(labour_hours),
            # Rounded to the paisa for transport; derived from a whole-rupee daily rate.
            "hourly_wage_paise": inr_to_paise(hourly_inr),
            "skill_level": skill_level,
        },
        **band_to_paise(band),
        "explanation": explain(band, is_demo=is_demo, notification_ref=source["notification_ref"]),
    }


__all__ = [
    "CALCULATION_VERSION",
    "InvalidPricingInput",
    "WageRateUnavailable",
    "calculate",
    "inr_to_paise",
    "load_engine",
    "paise_to_inr",
    "wage_table_is_demo",
]
