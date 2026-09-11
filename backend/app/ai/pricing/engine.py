"""
CraftLink fair-price engine.

The mechanism the whole pitch rests on: a listing may never be priced below what
the artisan's own labour is legally worth.

    floor   = material_cost + (labour_hours x statutory hourly wage for that skill/state)
    fair    = floor x craft_complexity_multiplier x (1 + margin)
    ceiling = fair x (1 + headroom), lifted toward comparables when we have any

Three properties matter more than the arithmetic:

1. It is auditable. Every input is either stated by the artisan or published by a
   government notification. There is no fitted model and nothing to reverse-engineer.
2. It refuses rather than guesses. A missing wage rate raises. A wrong floor is worse
   than no floor, because it launders underpayment through an official-looking number.
3. It explains itself. `PriceBand.explain()` returns the sentence read aloud to the
   artisan in their own language, so the number is never a black box to the person
   whose labour it prices.

Comparable market prices, when present, may only raise the band. They can never pull
it below the floor -- that asymmetry is the anti-exploitation guarantee.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping, Sequence

_HERE = Path(__file__).resolve().parent
_TAXONOMY = _HERE.parent / "taxonomy" / "craft_taxonomy.json"
_WAGE_TABLE = _HERE / "wage_table.json"

DEFAULT_MARGIN = 0.20      # artisan's margin over cost of production
DEFAULT_HEADROOM = 0.35    # ceiling headroom above fair price
SKILL_LEVELS = ("unskilled", "semi_skilled", "skilled", "highly_skilled")


class PricingError(Exception):
    """Base class for pricing failures."""


class WageRateUnavailable(PricingError):
    """No statutory wage rate on file for this state and skill level.

    Deliberately fatal. Falling back to a national average or a previous year's
    rate would produce a floor that looks authoritative and is not.
    """


class InvalidPricingInput(PricingError):
    """Inputs are outside the range the engine will price."""


@dataclass(frozen=True)
class PriceBand:
    floor: int
    fair: int
    ceiling: int
    currency: str = "INR"
    wage_rate_per_day: float | None = None
    wage_source: str | None = None
    labour_hours: float = 0.0
    material_cost: float = 0.0
    complexity_multiplier: float = 1.0
    comparables_used: int = 0

    def explain(self) -> str:
        """One sentence, spoken to the artisan. Keep it concrete and free of jargon."""
        return (
            f"This piece took {self.labour_hours:g} hours of work. "
            f"At the legal daily wage for this kind of skilled work in your state, "
            f"that labour alone is worth {self.currency} {self.floor - int(round(self.material_cost))}. "
            f"With materials, the lowest fair price is {self.currency} {self.floor}. "
            f"We suggest {self.currency} {self.fair}."
        )

    def as_dict(self) -> dict:
        return {
            "currency": self.currency,
            "floor": self.floor,
            "fair": self.fair,
            "ceiling": self.ceiling,
            "inputs": {
                "labour_hours": self.labour_hours,
                "material_cost": self.material_cost,
                "wage_rate_per_day": self.wage_rate_per_day,
                "wage_source": self.wage_source,
                "complexity_multiplier": self.complexity_multiplier,
                "comparables_used": self.comparables_used,
            },
        }


@dataclass
class PricingEngine:
    wage_table: Mapping = field(default_factory=dict)
    taxonomy: Mapping = field(default_factory=dict)
    margin: float = DEFAULT_MARGIN
    headroom: float = DEFAULT_HEADROOM

    # ---------- construction ----------

    @classmethod
    def from_files(
        cls,
        wage_table_path: Path | str = _WAGE_TABLE,
        taxonomy_path: Path | str = _TAXONOMY,
        **kwargs,
    ) -> "PricingEngine":
        wage_table = json.loads(Path(wage_table_path).read_text(encoding="utf-8"))
        taxonomy = json.loads(Path(taxonomy_path).read_text(encoding="utf-8"))
        return cls(wage_table=wage_table, taxonomy=taxonomy, **kwargs)

    # ---------- wage lookup ----------

    def hourly_wage(self, state_code: str, skill_level: str) -> tuple[float, str]:
        """Return (hourly rate, source label). Raises if the rate is not on file."""
        if skill_level not in SKILL_LEVELS:
            raise InvalidPricingInput(f"unknown skill level: {skill_level!r}")

        states = self.wage_table.get("states", {})
        entry = states.get(state_code.upper())
        if entry is None:
            raise WageRateUnavailable(
                f"No wage notification on file for state {state_code!r}. "
                f"Add it to wage_table.json with its source URL before pricing here."
            )

        rate_per_day = entry.get("rates", {}).get(skill_level)
        if rate_per_day is None:
            raise WageRateUnavailable(
                f"No {skill_level} rate on file for {state_code!r}. "
                f"Transcribe it from the state's minimum-wage notification; "
                f"the engine will not substitute an estimate."
            )

        hours_per_day = float(self.wage_table.get("hours_per_day", 8))
        if hours_per_day <= 0:
            raise InvalidPricingInput("hours_per_day must be positive")

        source = entry.get("notification_ref") or entry.get("source_url") or "unspecified notification"
        return float(rate_per_day) / hours_per_day, str(source)

    # ---------- complexity ----------

    def complexity_multiplier(self, techniques: Sequence[str]) -> float:
        block = self.taxonomy.get("complexity_multipliers", {})
        default = float(block.get("default", 1.0))
        by_technique = block.get("by_technique", {})
        applicable = [float(by_technique[t]) for t in techniques if t in by_technique]
        # The most demanding technique sets the multiplier; they do not compound,
        # otherwise a piece listing four techniques prices itself out of the market.
        return max(applicable) if applicable else default

    # ---------- main entry point ----------

    def price(
        self,
        *,
        labour_hours: float,
        skill_level: str,
        state_code: str,
        material_cost_inr: float = 0.0,
        techniques: Sequence[str] = (),
        comparables_inr: Iterable[float] = (),
    ) -> PriceBand:
        if labour_hours <= 0:
            raise InvalidPricingInput("labour_hours must be greater than zero")
        if material_cost_inr < 0:
            raise InvalidPricingInput("material_cost_inr cannot be negative")

        hourly, source = self.hourly_wage(state_code, skill_level)
        labour_value = hourly * float(labour_hours)
        floor = material_cost_inr + labour_value

        multiplier = self.complexity_multiplier(techniques)
        fair = floor * multiplier * (1.0 + self.margin)
        ceiling = fair * (1.0 + self.headroom)

        comps = [c for c in comparables_inr if c and c > 0]
        if comps:
            median = sorted(comps)[len(comps) // 2]
            # Comparables may lift the band toward what the market actually pays.
            # They may never drag it down: that is the whole guarantee.
            fair = max(fair, min(median, ceiling))
            ceiling = max(ceiling, median)

        floor_i = int(round(floor))
        fair_i = max(int(round(fair)), floor_i)
        ceiling_i = max(int(round(ceiling)), fair_i)

        return PriceBand(
            floor=floor_i,
            fair=fair_i,
            ceiling=ceiling_i,
            wage_rate_per_day=hourly * float(self.wage_table.get("hours_per_day", 8)),
            wage_source=source,
            labour_hours=float(labour_hours),
            material_cost=float(material_cost_inr),
            complexity_multiplier=multiplier,
            comparables_used=len(comps),
        )

    # ---------- publish gate ----------

    def is_publishable(self, price_inr: float, band: PriceBand) -> bool:
        """The hard stop. Called before a listing may be published at a chosen price."""
        return price_inr >= band.floor


def price_from_listing(engine: PricingEngine, listing: Mapping) -> PriceBand:
    """Convenience: price a listing that already validates against listing.schema.json."""
    labour = listing["labour"]
    return engine.price(
        labour_hours=labour["hours"],
        skill_level=labour["skill_level"],
        state_code=labour["state_code"],
        material_cost_inr=listing.get("material_cost_inr", 0.0),
        techniques=listing.get("techniques", ()),
    )
