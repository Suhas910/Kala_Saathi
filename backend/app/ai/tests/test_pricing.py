"""Fair-price engine. Every test here asserts a claim the deck makes."""

from __future__ import annotations

import json

import pytest

from app.ai.pricing.engine import (
    InvalidPricingInput,
    PricingEngine,
    WageRateUnavailable,
    price_from_listing,
)

from .conftest import AI_ROOT, SAMPLE_LISTING


def test_floor_is_materials_plus_labour_at_statutory_wage(engine):
    band = engine.price(labour_hours=60, skill_level="skilled", state_code="KA",
                        material_cost_inr=3000, techniques=["handloom_weave"])
    # 600/day over 8h = 75/h; 60h = 4500; + 3000 materials = 7500
    assert band.floor == 7500


def test_fair_price_never_below_floor(engine):
    band = engine.price(labour_hours=1, skill_level="skilled", state_code="KA",
                        material_cost_inr=0, techniques=[])
    assert band.fair >= band.floor
    assert band.ceiling >= band.fair


def test_low_comparables_cannot_drag_price_below_floor(engine):
    """The anti-exploitation guarantee: the market may lift the band, never lower it."""
    band = engine.price(labour_hours=60, skill_level="skilled", state_code="KA",
                        material_cost_inr=3000, techniques=["handloom_weave"],
                        comparables_inr=[900, 1200, 1000])
    assert band.floor == 7500
    assert band.fair >= 7500


def test_high_comparables_lift_the_fair_price(engine):
    low = engine.price(labour_hours=20, skill_level="skilled", state_code="KA",
                       material_cost_inr=500, techniques=["handloom_weave"])
    lifted = engine.price(labour_hours=20, skill_level="skilled", state_code="KA",
                          material_cost_inr=500, techniques=["handloom_weave"],
                          comparables_inr=[9000, 9500, 10000])
    assert lifted.fair > low.fair


def test_missing_wage_rate_refuses_rather_than_guesses(engine):
    with pytest.raises(WageRateUnavailable):
        engine.price(labour_hours=10, skill_level="skilled", state_code="TN")
    with pytest.raises(WageRateUnavailable):
        engine.price(labour_hours=10, skill_level="skilled", state_code="ZZ")


def test_shipped_wage_table_is_unpopulated_by_design():
    """The repo must not ship invented wage rates.

    This test failing is not a bug in the test. It means someone filled the table with
    plausible numbers, and every listing priced in that state is now wrong in a way
    that looks official.
    """
    table = json.loads((AI_ROOT / "pricing" / "wage_table.json").read_text(encoding="utf-8"))
    rates = [rate for state in table["states"].values() for rate in state["rates"].values()]
    assert all(rate is None for rate in rates), "wage_table.json must ship empty; fill from notifications"


def test_publish_gate_blocks_below_floor(engine):
    band = engine.price(labour_hours=60, skill_level="skilled", state_code="KA",
                        material_cost_inr=3000, techniques=["handloom_weave"])
    assert engine.is_publishable(band.floor, band) is True
    assert engine.is_publishable(band.floor - 1, band) is False


def test_complexity_takes_the_max_not_the_product(engine):
    band = engine.price(labour_hours=10, skill_level="skilled", state_code="KA",
                        techniques=["handloom_weave", "jamdani", "block_print"])
    assert band.complexity_multiplier == pytest.approx(1.45)


def test_invalid_inputs_rejected(engine):
    with pytest.raises(InvalidPricingInput):
        engine.price(labour_hours=0, skill_level="skilled", state_code="KA")
    with pytest.raises(InvalidPricingInput):
        engine.price(labour_hours=5, skill_level="wizard", state_code="KA")


def test_explanation_mentions_hours_and_floor(engine):
    band = engine.price(labour_hours=60, skill_level="skilled", state_code="KA",
                        material_cost_inr=3000, techniques=["handloom_weave"])
    text = band.explain()
    assert "60" in text and str(band.floor) in text


def test_price_from_listing(engine):
    assert price_from_listing(engine, SAMPLE_LISTING).floor == 7500
