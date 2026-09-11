"""
ONDC linkage.

The point of this file is `test_on_search_payload_conforms_to_published_ondc_schema`.
Everything else checks that our own fields survive the mapping; that one checks that
the payload satisfies someone else's contract, which is the only kind of integration
claim worth making before registration.
"""

from __future__ import annotations

import json

import pytest

from app.ai.linkage import contract_test
from app.ai.linkage.beckn import (
    CORE_VERSION,
    DOMAIN_RETAIL,
    build_on_search,
    listing_to_item,
    to_gem_csv_rows,
)
from app.ai.pricing.engine import price_from_listing

from .conftest import SAMPLE_LISTING


@pytest.fixture
def band(engine):
    return price_from_listing(engine, SAMPLE_LISTING).as_dict()


def test_on_search_payload_conforms_to_published_ondc_schema():
    """The contract test, as a unit test so CI cannot skip past it.

    A missing schema file fails here rather than skipping. The file is committed; if it
    has gone missing, that is a regression and not a reason to report success.
    """
    pytest.importorskip("jsonschema")
    assert contract_test.SCHEMA_PATH.exists(), (
        f"{contract_test.SCHEMA_PATH} is missing. Regenerate it: "
        "python -m app.ai.linkage.fetch_ondc_schema"
    )
    violations = contract_test.validate(contract_test.build_sample_payload())
    assert violations == []


def test_committed_schema_is_derived_from_ondc_and_says_so():
    """The schema must carry its own provenance, or it proves nothing."""
    schema = json.loads(contract_test.SCHEMA_PATH.read_text(encoding="utf-8"))
    provenance = schema.get("x-craftlink-provenance", {})
    assert provenance.get("source_repo") == "ONDC-Official/ONDC-RET-Specifications"
    assert provenance.get("core_version") == CORE_VERSION, (
        "The schema and the builder have drifted apart. Regenerate the schema, or fix "
        "CORE_VERSION in beckn.py; a suite green against the wrong version proves nothing."
    )
    assert provenance.get("source_commit")


def test_domain_matches_the_version_we_validate_against():
    """Guards a mistake the contract test caught once already.

    `ONDC:RET10` reads as obviously correct and is wrong for core 1.2.0, which
    enumerates only the NIC 2004 code.
    """
    assert DOMAIN_RETAIL == "nic2004:52110"


def test_item_carries_floor_and_only_verified_claims(band):
    item = listing_to_item(SAMPLE_LISTING, band, provider_id="P-1")
    assert item["price"]["minimum_value"] == str(band["floor"])
    tags = {entry["code"]: entry["value"] for entry in item["tags"]["list"]}
    assert "handloom_weave" in tags["verified_claims"]
    assert tags["wage_floor_inr"] == str(band["floor"])
    assert tags["priced_at_or_above_wage_floor"] == "yes"


def test_unverified_claim_never_reaches_the_wire(band):
    """Belt and braces: even if the guard were bypassed, the mapper drops it."""
    import copy

    listing = copy.deepcopy(SAMPLE_LISTING)
    listing["provenance"]["claims"] = [
        {"claim": "handloom_weave", "asserted_by_artisan": True, "coordinator_verified": False},
    ]
    item = listing_to_item(listing, band, provider_id="P-1")
    tags = {entry["code"]: entry["value"] for entry in item["tags"]["list"]}
    assert tags["verified_claims"] == "none"


def test_on_search_has_context_and_one_item(band):
    payload = build_on_search(
        listings_with_prices=[(SAMPLE_LISTING, band)],
        provider_id="P-1", provider_name="Cluster Co-operative",
        bap_id="buyerapp.example", bap_uri="https://buyerapp.example/ondc",
        bpp_id="craftlink.example", bpp_uri="https://craftlink.example/ondc",
    )
    assert payload["context"]["action"] == "on_search"
    assert payload["context"]["bap_id"] == "buyerapp.example"
    assert len(payload["message"]["catalog"]["bpp/providers"][0]["items"]) == 1


def test_gem_csv_export(band):
    rows = to_gem_csv_rows([(SAMPLE_LISTING, band)])
    assert rows[0]["sku"] == "L-0001"
    assert rows[0]["floor_price_inr"] == band["floor"]
    assert "handloom_weave" in rows[0]["verified_claims"]
