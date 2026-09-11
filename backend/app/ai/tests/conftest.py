"""Shared fixtures for the AI suite."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.ai.pricing.engine import PricingEngine
from app.ai.taxonomy.guard import load_taxonomy

AI_ROOT = Path(__file__).resolve().parent.parent
IMAGE_FIXTURES = AI_ROOT / "fixtures" / "images" / "synthetic"

# A wage table with rates filled in, used only by tests. Real rates come from state
# minimum-wage notifications. The notification_ref says so in capitals so this value
# can never be copied into anything that ships.
TEST_WAGE_TABLE = {
    "unit": "INR_per_8h_day",
    "hours_per_day": 8,
    "states": {
        "KA": {
            "state_name": "Karnataka",
            "notification_ref": "TEST-FIXTURE-NOT-A-REAL-NOTIFICATION",
            "rates": {"unskilled": 400, "semi_skilled": 500, "skilled": 600, "highly_skilled": 700},
        },
        "TN": {"state_name": "Tamil Nadu", "rates": {"skilled": None}},
    },
}

SAMPLE_LISTING = {
    "listing_id": "L-0001",
    "category": "handloom_saree",
    "materials": ["silk"],
    "techniques": ["handloom_weave", "extra_weft"],
    "finish": "natural_dye",
    "dimensions": {"length_m": 5.5, "width_m": 1.15},
    "title": {"en": "Handwoven silk saree with extra-weft border", "local_language": "kn"},
    "description": {"en": "A silk saree woven on a pit loom, with an extra-weft border worked by hand."},
    "labour": {"hours": 60, "skill_level": "skilled", "state_code": "KA"},
    "material_cost_inr": 3000,
    "provenance": {
        "claims": [
            {"claim": "handloom_weave", "asserted_by_artisan": True, "coordinator_verified": True},
            {"claim": "natural_dye", "asserted_by_artisan": True, "coordinator_verified": True},
        ],
        "gi_tag": None,
    },
    "source": {
        "transcript_id": "T-0001",
        "asr_confidence": 0.91,
        "asr_provider": "fixture",
        "image_ids": ["https://craftlink.example/media/img-1.jpg"],
        "low_confidence_fields": [],
    },
    "status": "awaiting_approval",
}


@pytest.fixture(scope="session")
def taxonomy() -> dict:
    return load_taxonomy()


@pytest.fixture
def engine(taxonomy) -> PricingEngine:
    return PricingEngine(wage_table=TEST_WAGE_TABLE, taxonomy=taxonomy)


@pytest.fixture(scope="session")
def listing_schema() -> dict:
    import json

    return json.loads((AI_ROOT / "taxonomy" / "listing.schema.json").read_text(encoding="utf-8"))


def image_fixture(stem: str) -> Path:
    path = IMAGE_FIXTURES / f"{stem}.png"
    if not path.exists():
        raise AssertionError(
            f"Missing image fixture {path}. Generate them: "
            "python -m app.ai.fixtures.generate_image_fixtures"
        )
    return path
