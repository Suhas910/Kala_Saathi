"""Provenance guard, and the listing schema that constrains generation."""

from __future__ import annotations

import copy

import pytest

from app.ai.taxonomy.guard import (
    ProvenanceViolation,
    can_publish,
    enforce,
    unverified_sensitive,
)

from .conftest import SAMPLE_LISTING


def test_verified_claims_survive(taxonomy):
    assert can_publish(SAMPLE_LISTING, taxonomy) is True
    assert enforce(SAMPLE_LISTING, taxonomy)["techniques"] == ["handloom_weave", "extra_weft"]


def test_unverified_handloom_claim_is_stripped_not_softened(taxonomy):
    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["provenance"]["claims"] = [
        {"claim": "handloom_weave", "asserted_by_artisan": True, "coordinator_verified": False},
        {"claim": "natural_dye", "asserted_by_artisan": True, "coordinator_verified": True},
    ]
    assert "handloom_weave" in unverified_sensitive(bad, taxonomy)
    cleaned = enforce(bad, taxonomy)
    assert "handloom_weave" not in cleaned["techniques"]
    assert "extra_weft" in cleaned["techniques"]  # non-sensitive claims are untouched


def test_unverified_gi_tag_is_removed(taxonomy):
    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["provenance"]["gi_tag"] = "Some GI Name"
    assert enforce(bad, taxonomy)["provenance"]["gi_tag"] is None


def test_unverified_natural_dye_downgrades_finish(taxonomy):
    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["provenance"]["claims"] = [
        {"claim": "handloom_weave", "asserted_by_artisan": True, "coordinator_verified": True},
    ]
    assert enforce(bad, taxonomy)["finish"] == "none"


def test_artisan_assertion_alone_is_not_enough(taxonomy):
    """Both signatures are required. This is the difference between the two layers."""
    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["provenance"]["claims"] = [
        {"claim": "handloom_weave", "asserted_by_artisan": True, "coordinator_verified": False},
        {"claim": "natural_dye", "asserted_by_artisan": False, "coordinator_verified": True},
    ]
    offending = unverified_sensitive(bad, taxonomy)
    assert "handloom_weave" in offending
    assert "natural_dye" in offending


def test_strict_mode_raises_for_ci(taxonomy):
    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["provenance"]["claims"] = []
    with pytest.raises(ProvenanceViolation):
        enforce(bad, taxonomy, strict=True)


def test_listing_with_no_verified_technique_cannot_publish(taxonomy):
    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["techniques"] = ["handloom_weave"]
    bad["finish"] = "none"
    bad["provenance"]["claims"] = []
    with pytest.raises(ProvenanceViolation):
        enforce(bad, taxonomy)


# ---------------------------------------------------------------- schema layer


def test_sample_listing_validates_against_schema(listing_schema):
    import jsonschema

    jsonschema.validate(SAMPLE_LISTING, listing_schema)


def test_schema_rejects_invented_technique(listing_schema):
    """Layer one of the guard: the model is structurally unable to name a fake craft."""
    import jsonschema

    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["techniques"] = ["ancient_royal_weave"]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, listing_schema)


def test_schema_rejects_unknown_field(listing_schema):
    import jsonschema

    bad = copy.deepcopy(SAMPLE_LISTING)
    bad["marketing_hype"] = "world famous"
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, listing_schema)


def test_gi_registry_ships_empty(taxonomy):
    """A wrong GI claim is a legal problem, not a cosmetic one."""
    assert taxonomy["gi_registry"]["entries"] == [], (
        "gi_registry must ship empty; populate it from the official GI Registry"
    )
