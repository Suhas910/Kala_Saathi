"""
Provenance enforcement for the live catalogue path.

`taxonomy/guard.py` is the canonical guard and operates on a listing shaped like
`listing.schema.json`. The catalogue the HTTP API actually produces is a
`schemas.CatalogueDraft`, which is a different shape with free-text materials and
techniques. This module applies the same rules to that shape.

It is written as a gate around whatever generates the catalogue, so it does not care
whether that was Gemini, a fixture, or a future model. Everything passes through here
before it is stored or returned.

## The rules, and why each one is strict

**A sensitive claim survives only with both signatures.** The artisan asserted it and a
coordinator verified it. One is not enough. `craft_taxonomy.json` names which claims
are sensitive; today that is gi_tag, handloom_weave, hand_embroidery, natural_dye,
lost_wax_cast and hand_carved.

**Unverified claims are removed, not softened.** There is no "possibly handloom". To a
buyer reading a listing, a hedged craft claim is still a craft claim, and the hedge is
what a marketplace summary strips first.

**A generator can never assert on the artisan's behalf.** The live catalogue path was
observed returning `asserted_by_artisan: true` on claims produced from an endpoint
called with an empty body. No artisan asserted anything. Assertion is an act by a
person, so anything arriving from generation is forced to `False` here and can only
become `True` through an explicit artisan action.

**GI tags are held to the strictest version of the rule.** A GI identifier attached to
the wrong product is a legal exposure rather than a quality problem. The tag survives
only when a `gi_tag` claim carries both signatures, and the registry it should be
checked against ships empty on purpose.

## What this does not do

It does not validate materials or techniques against the taxonomy enums. The live
catalogue emits free text ("Lathe Turning", "Ivory Wood (Aale Mara)"), and mapping that
onto the controlled vocabulary is a generation-side change that belongs with the model
wiring, not here. Until that happens, the schema-constrained layer of the guard is not
active on this path, and only this second layer is. Both were always meant to run.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

_TAXONOMY_PATH = Path(__file__).resolve().parent / "taxonomy" / "craft_taxonomy.json"


def sensitive_claims(taxonomy: dict | None = None) -> set[str]:
    taxonomy = taxonomy or json.loads(_TAXONOMY_PATH.read_text(encoding="utf-8"))
    return set(taxonomy.get("claim_verification", {}).get("requires_coordinator_verification", []))


def _is_verified(claim: dict) -> bool:
    return bool(claim.get("asserted_by_artisan")) and bool(claim.get("coordinator_verified"))


def enforce_catalogue(
    catalogue: dict[str, Any],
    *,
    taxonomy: dict | None = None,
    generated: bool = True,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return (cleaned catalogue, report).

    `generated=True` means the claims came from a model or fixture rather than from an
    artisan tapping confirm, and forces `asserted_by_artisan` to False. Pass False only
    on a path where a person really did assert.

    The report is not decoration. `TEAM_BUILD_GUIDE.md` requires every AI outcome to be
    traceable, and "the guard removed a GI tag" is exactly the kind of event that must
    be visible later when someone asks why a listing looks thinner than the artisan
    described.
    """
    cleaned = json.loads(json.dumps(catalogue))  # deep copy; never mutate the caller's dict
    sensitive = sensitive_claims(taxonomy)

    provenance = cleaned.setdefault("provenance", {})
    claims: list[dict] = list(provenance.get("claims") or [])

    stripped_claims: list[str] = []
    downgraded: list[str] = []
    kept: list[dict] = []

    for claim in claims:
        name = claim.get("claim")
        if generated and claim.get("asserted_by_artisan"):
            # The generator is not the artisan. Record that we corrected this.
            claim["asserted_by_artisan"] = False
            downgraded.append(name)

        if name in sensitive and not _is_verified(claim):
            # Kept on the record as an unverified assertion so a coordinator can review
            # it, but it will not be allowed to reach a buyer. Removing it outright
            # would also remove the coordinator's reason to look at it.
            claim["publishable"] = False
            stripped_claims.append(name)
        else:
            claim["publishable"] = True
        kept.append(claim)

    provenance["claims"] = kept

    gi_tag = provenance.get("gi_tag")
    gi_removed = None
    if gi_tag:
        gi_verified = any(c.get("claim") == "gi_tag" and _is_verified(c) for c in kept)
        if not gi_verified:
            gi_removed = gi_tag
            provenance["gi_tag"] = None

    technique_names = list(cleaned.get("techniques") or [])
    unverified_techniques = [
        t for t in technique_names
        if t in sensitive and not any(c.get("claim") == t and _is_verified(c) for c in kept)
    ]
    if unverified_techniques:
        cleaned["techniques"] = [t for t in technique_names if t not in unverified_techniques]

    report = {
        "enforced": True,
        "unpublishable_claims": sorted(set(stripped_claims)),
        "gi_tag_removed": gi_removed,
        "techniques_removed": sorted(set(unverified_techniques)),
        "assertions_downgraded": sorted({d for d in downgraded if d}),
        "note": (
            "Sensitive claims require an artisan assertion and a coordinator verification "
            "before they may be published. Unverified claims are retained for coordinator "
            "review but marked publishable=false."
        ),
    }
    return cleaned, report


def publishable_claims(catalogue: dict[str, Any]) -> list[str]:
    """The claims that may appear on a buyer-facing listing right now."""
    return [
        c["claim"]
        for c in (catalogue.get("provenance", {}).get("claims") or [])
        if c.get("publishable") and c.get("claim")
    ]


__all__ = ["enforce_catalogue", "publishable_claims", "sensitive_claims"]
