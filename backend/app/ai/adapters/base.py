"""
Provider interfaces.

`TEAM_BUILD_GUIDE.md`: "Put every external service behind an adapter interface. The
product should switch from Bhashini to an approved fallback without rewriting
application logic."

That sentence is a pitch claim, and this file is what makes it checkable. The rest of
the codebase depends on these Protocols and never on a provider module, so swapping
Bhashini for a self-hosted AI4Bharat model, or for a fixture during a demo, is a
change to one registry entry.

Structural typing (`Protocol`) rather than inheritance is deliberate: an adapter is
whatever satisfies the shape. A future provider SDK wrapper does not have to import
anything from here to be usable, which keeps the dependency arrow pointing the right
way.

## The three rules every adapter must honour

1. **Return the contract type, never the provider's own response.** Raw provider
   payloads stay in logs, not in results. A field named after a vendor is a field the
   whole system will eventually depend on.
2. **Stamp `AdapterInfo` on every result.** Which provider, which model, on-device or
   not. A confidence number nobody can attribute is a number nobody can audit.
3. **Fail as `AIError` with a contract error code.** `PROVIDER_UNAVAILABLE` and
   `ASR_LOW_CONFIDENCE` are things the app can act on. A raw `requests` exception is
   not, and `AI_INTERFACE_CONTRACTS.md` forbids showing one to an artisan.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from ..contracts import CatalogueResult, TranscriptResult

# Audio arrives either as a path on disk or as raw bytes already in memory. Adapters
# accept both so the caller is not forced to spill an upload to disk just to satisfy
# a signature.
AudioSource = Path | str | bytes


@runtime_checkable
class ASRAdapter(Protocol):
    """Speech to text, in an Indian language, with per-span uncertainty."""

    name: str

    def is_available(self) -> bool:
        """Whether this adapter can run right now.

        Checked before use so a missing model file or an unset credential becomes a
        clean fallback to the next provider, rather than an exception in the middle of
        an artisan's first listing.
        """
        ...

    def transcribe(
        self,
        audio: AudioSource,
        *,
        declared_language: str | None = None,
        transcript_id: str | None = None,
    ) -> TranscriptResult:
        """Transcribe audio.

        `declared_language` is what the artisan chose in the app. It is a hint, not an
        instruction: `TranscriptResult.detected_language` reports what the recogniser
        actually found, and the two disagreeing is useful information rather than an
        error. Code-mixed speech is normal in this user group.
        """
        ...


@runtime_checkable
class TranslationAdapter(Protocol):
    """Text to text, across the scheduled languages."""

    name: str

    def is_available(self) -> bool: ...

    def translate(self, text: str, *, source_language: str, target_language: str) -> str: ...


@runtime_checkable
class CatalogueGeneratorAdapter(Protocol):
    """Transcript and image evidence to a schema-valid listing.

    The only place in the pipeline where a model has latitude, and therefore the place
    with the most constraint around it: generation is schema-constrained on the way in
    and the provenance guard runs on the way out. An implementation that returns
    anything failing `taxonomy/listing.schema.json` must raise
    `CATALOGUE_SCHEMA_INVALID`, not repair the output. Parsing prose after the fact and
    calling it validation is explicitly forbidden by `TEAM_BUILD_GUIDE.md`.
    """

    name: str

    def is_available(self) -> bool: ...

    def generate(
        self,
        *,
        transcript: TranscriptResult,
        confirmed_facts: dict[str, Any],
        image_labels: list[str] | None = None,
        taxonomy_version: str = "0.1.0",
    ) -> CatalogueResult: ...


__all__ = [
    "ASRAdapter",
    "AudioSource",
    "CatalogueGeneratorAdapter",
    "TranslationAdapter",
]
