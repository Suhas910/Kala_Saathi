"""
The deterministic price path, in the units the HTTP API speaks.

`test_pricing.py` covers the engine. This file covers the bridge: unit conversion,
the provenance block, and the two behaviours the legacy path got wrong.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.ai.pricing import bridge
from app.ai.pricing.engine import WageRateUnavailable

from .conftest import AI_ROOT

DEMO_TABLE = AI_ROOT / "pricing" / "wage_table.demo.json"
REAL_TABLE = AI_ROOT / "pricing" / "wage_table.json"


def price(**kw):
    kw.setdefault("wage_table_path", DEMO_TABLE)
    kw.setdefault("material_cost_paise", 45000)
    kw.setdefault("labour_hours", 6.0)
    kw.setdefault("skill_level", "skilled")
    kw.setdefault("state_code", "KA")
    return bridge.calculate(**kw)


# ---------------------------------------------------------------- units


def test_paise_and_rupee_conversion_round_trips():
    assert bridge.paise_to_inr(45000) == 450.0
    assert bridge.inr_to_paise(450.0) == 45000
    assert bridge.inr_to_paise(bridge.paise_to_inr(123400)) == 123400


def test_floor_is_materials_plus_labour_in_paise():
    # demo KA skilled = 620/8h day = 77.50/hr; 6h = 465 INR; + 450 materials = 915 INR
    assert price()["floor_amount_paise"] == 91500


# ---------------------------------------------------------------- the legacy defects


def test_skill_level_actually_changes_the_price():
    """The defect that motivated this path.

    The legacy service accepts skill_level, echoes it back in `inputs`, and returns the
    same wage for every level. The deck's claim is the state statutory *skilled* wage;
    if the field is inert, that sentence is not what the code computes.
    """
    floors = {
        level: price(skill_level=level, material_cost_paise=0)["floor_amount_paise"]
        for level in ("unskilled", "semi_skilled", "skilled", "highly_skilled")
    }
    assert len(set(floors.values())) == 4, f"skill level is not reaching the wage lookup: {floors}"
    assert floors["unskilled"] < floors["semi_skilled"] < floors["skilled"] < floors["highly_skilled"]


def test_comparables_may_lift_the_band_but_never_the_floor():
    """The anti-exploitation guarantee, absent from the legacy path entirely."""
    base = price(labour_hours=60, material_cost_paise=300000)
    undercut = price(labour_hours=60, material_cost_paise=300000,
                     comparables_paise=[90000, 120000, 100000])
    premium = price(labour_hours=60, material_cost_paise=300000,
                    comparables_paise=[1900000, 1950000, 2000000])

    assert undercut["floor_amount_paise"] == base["floor_amount_paise"]
    assert undercut["recommended_low_paise"] >= base["floor_amount_paise"]
    assert premium["recommended_low_paise"] > base["recommended_low_paise"]


# ---------------------------------------------------------------- refusal


def test_shipped_table_refuses_because_it_carries_no_rates():
    """The shipped table is empty on purpose, so the honest answer is a refusal."""
    with pytest.raises(WageRateUnavailable):
        price(wage_table_path=REAL_TABLE)


def test_unknown_state_refuses():
    with pytest.raises(WageRateUnavailable):
        price(state_code="ZZ")


# ---------------------------------------------------------------- disclosure


def test_demo_rates_are_disclosed_in_the_response_not_only_the_file():
    """A fixture rate must be identifiable from the payload alone.

    Whoever reads the number on a screen is not reading wage_table.demo.json.
    """
    result = price()
    assert "DEMO-FIXTURE" in result["wage_source"]["notification_ref"]
    assert "not a real price" in result["explanation"].lower()
    assert result["wage_source"]["source_url"] == "unsourced://demo-fixture"


def test_real_table_would_not_carry_the_demo_marker():
    table = json.loads(REAL_TABLE.read_text(encoding="utf-8"))
    assert not bridge.wage_table_is_demo(table)
    assert "DEMO-FIXTURE" not in bridge.wage_source_fields(table, "KA")["notification_ref"]


def test_wage_source_never_returns_empty_strings():
    """`unspecified` prompts someone to find the notification; `""` reads as a bug."""
    table = json.loads(REAL_TABLE.read_text(encoding="utf-8"))
    fields = bridge.wage_source_fields(table, "KA")
    assert all(value for value in fields.values())


def test_calculation_version_identifies_the_engine():
    """A stored price must be traceable to the formula that produced it."""
    assert price()["calculation_version"] == bridge.CALCULATION_VERSION
    assert "deterministic" in bridge.CALCULATION_VERSION
