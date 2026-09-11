"""
Provenance guard -- the code behind the claim "the AI cannot invent craft claims".

Two independent layers, and the pitch should say both:

1. Generation is schema-constrained. The model emits into listing.schema.json, whose
   provenance-bearing fields are enums drawn from the taxonomy. It is structurally
   unable to name a technique or material that does not exist.

2. Publication is gated. Even a well-formed claim from the enum cannot reach a buyer
   unless the artisan asserted it AND a coordinator verified it. Layer 1 stops
   hallucination; layer 2 stops an honest mistake becoming a false marketing claim.

`enforce()` returns the listing that is safe to publish -- unverified sensitive claims
are stripped, not softened. There is no "possibly handloom": to a buyer that still
reads as handloom.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping

_HERE = Path(__file__).resolve().parent
_TAXONOMY = _HERE / "craft_taxonomy.json"


class ProvenanceViolation(Exception):
    """A listing tried to publish a claim it has not earned."""


def load_taxonomy(path: Path | str = _TAXONOMY) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sensitive_claims(taxonomy: Mapping) -> set[str]:
    return set(taxonomy.get("claim_verification", {}).get("requires_coordinator_verification", []))


def verified_claims(listing: Mapping) -> set[str]:
    return {
        c["claim"]
        for c in listing.get("provenance", {}).get("claims", [])
        if c.get("asserted_by_artisan") and c.get("coordinator_verified")
    }


def unverified_sensitive(listing: Mapping, taxonomy: Mapping) -> set[str]:
    """Sensitive claims implied by the listing's own fields but not verified."""
    sensitive = sensitive_claims(taxonomy)
    implied = set(listing.get("techniques", []))
    if listing.get("finish") == "natural_dye":
        implied.add("natural_dye")
    if listing.get("provenance", {}).get("gi_tag"):
        implied.add("gi_tag")
    return (implied & sensitive) - verified_claims(listing)


def enforce(listing: Mapping, taxonomy: Mapping | None = None, *, strict: bool = False) -> dict:
    """Strip unverified sensitive claims. With strict=True, raise instead.

    Use strict=True in tests and CI so a regression is loud. Use the default in the
    publish path so one unverified claim does not block an otherwise honest listing.
    """
    taxonomy = taxonomy or load_taxonomy()
    offending = unverified_sensitive(listing, taxonomy)
    if not offending:
        return dict(listing)

    if strict:
        raise ProvenanceViolation(
            "unverified sensitive claims: " + ", ".join(sorted(offending))
        )

    cleaned = json.loads(json.dumps(listing))  # deep copy
    cleaned["techniques"] = [t for t in cleaned.get("techniques", []) if t not in offending]
    if "natural_dye" in offending and cleaned.get("finish") == "natural_dye":
        cleaned["finish"] = "none"
    if "gi_tag" in offending:
        cleaned.setdefault("provenance", {})["gi_tag"] = None

    # A listing whose every technique was stripped is not publishable as craft.
    if not cleaned.get("techniques"):
        raise ProvenanceViolation(
            "no verified technique remains; send back to the coordinator for verification"
        )
    return cleaned


def can_publish(listing: Mapping, taxonomy: Mapping | None = None) -> bool:
    taxonomy = taxonomy or load_taxonomy()
    return not unverified_sensitive(listing, taxonomy)
