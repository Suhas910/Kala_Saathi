"""
The provenance gate on the live catalogue shape.

`test_provenance.py` covers the canonical guard. This covers the gate that wraps
whatever generates the API's catalogue, using the exact payload the live endpoint was
observed returning on 2026-09-11.
"""

from __future__ import annotations

import copy

from app.ai.provenance_gate import enforce_catalogue, publishable_claims, sensitive_claims

# Captured verbatim from POST /api/v1/listings/{id}/jobs/catalogue with an empty body.
OBSERVED = {
    "listing_id": "23853d40-7a0f-40cb-9a3c-89b3463e7400",
    "category": "Woodcraft & Toys",
    "materials": ["Ivory Wood (Aale Mara)", "Vegetable Lacquer Dye"],
    "techniques": ["Lathe Turning", "Natural Lacquer Polishing"],
    "provenance": {
        "claims": [
            {"claim": "natural_dye", "asserted_by_artisan": True,
             "coordinator_verified": False, "evidence_note": None},
            {"claim": "gi_tag", "asserted_by_artisan": True,
             "coordinator_verified": False, "evidence_note": None},
        ],
        "gi_tag": "Channapatna Toys & Dolls (GI-18)",
    },
}


def test_unverified_gi_identifier_is_removed():
    """The legal-risk case. A GI tag on the wrong product is not a cosmetic bug."""
    cleaned, report = enforce_catalogue(OBSERVED)
    assert cleaned["provenance"]["gi_tag"] is None
    assert report["gi_tag_removed"] == "Channapatna Toys & Dolls (GI-18)"


def test_generator_cannot_assert_on_the_artisans_behalf():
    """`asserted_by_artisan: true` arrived from an endpoint called with an empty body."""
    cleaned, report = enforce_catalogue(OBSERVED, generated=True)
    assert all(not c["asserted_by_artisan"] for c in cleaned["provenance"]["claims"])
    assert set(report["assertions_downgraded"]) == {"gi_tag", "natural_dye"}


def test_an_actual_artisan_assertion_is_preserved():
    """generated=False is the path where a person really did tap confirm."""
    cleaned, _ = enforce_catalogue(OBSERVED, generated=False)
    assert all(c["asserted_by_artisan"] for c in cleaned["provenance"]["claims"])


def test_unverified_sensitive_claims_are_unpublishable_but_retained():
    """Removing them outright would also remove the coordinator's reason to look."""
    cleaned, report = enforce_catalogue(OBSERVED)
    assert publishable_claims(cleaned) == []
    assert len(cleaned["provenance"]["claims"]) == 2
    assert set(report["unpublishable_claims"]) == {"gi_tag", "natural_dye"}


def test_both_signatures_are_required():
    for artisan, coordinator in ((True, False), (False, True), (False, False)):
        payload = copy.deepcopy(OBSERVED)
        payload["provenance"]["claims"] = [
            {"claim": "natural_dye", "asserted_by_artisan": artisan,
             "coordinator_verified": coordinator, "evidence_note": None}
        ]
        cleaned, _ = enforce_catalogue(payload, generated=False)
        assert publishable_claims(cleaned) == [], f"{artisan=} {coordinator=} should not publish"


def test_fully_verified_claim_survives_and_keeps_its_gi_tag():
    payload = copy.deepcopy(OBSERVED)
    payload["provenance"]["claims"] = [
        {"claim": "gi_tag", "asserted_by_artisan": True,
         "coordinator_verified": True, "evidence_note": "Cluster documentation on file"},
    ]
    cleaned, report = enforce_catalogue(payload, generated=False)
    assert cleaned["provenance"]["gi_tag"] == "Channapatna Toys & Dolls (GI-18)"
    assert report["gi_tag_removed"] is None
    assert publishable_claims(cleaned) == ["gi_tag"]


def test_non_sensitive_techniques_are_untouched():
    """The gate is narrow. It removes unearned claims, not ordinary product detail."""
    cleaned, _ = enforce_catalogue(OBSERVED)
    assert cleaned["techniques"] == ["Lathe Turning", "Natural Lacquer Polishing"]
    assert cleaned["materials"] == OBSERVED["materials"]
    assert cleaned["category"] == "Woodcraft & Toys"


def test_sensitive_technique_is_stripped_when_unverified():
    payload = copy.deepcopy(OBSERVED)
    payload["techniques"] = ["Lathe Turning", "handloom_weave"]
    cleaned, report = enforce_catalogue(payload)
    assert "handloom_weave" not in cleaned["techniques"]
    assert "Lathe Turning" in cleaned["techniques"]
    assert report["techniques_removed"] == ["handloom_weave"]


def test_the_caller_dict_is_never_mutated():
    before = copy.deepcopy(OBSERVED)
    enforce_catalogue(OBSERVED)
    assert OBSERVED == before


def test_sensitive_list_comes_from_the_taxonomy():
    assert {"gi_tag", "handloom_weave", "natural_dye"} <= sensitive_claims()
