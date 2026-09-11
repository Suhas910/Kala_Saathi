"""
Fixture adapters: recorded results, replayed deterministically.

These are what unblock everyone else. `TEAM_BUILD_GUIDE.md` Phase 1 has the frontend,
backend and AI teams building in parallel against saved responses, and that only works
if the saved responses come through the same interface the real providers will. The
backend can wire up job orchestration today, against `FixtureASRAdapter`, and switch
to Bhashini later by changing one name.

They also make the failure paths testable. Phase 3 requires deliberately exercising
low confidence, bad audio and provider outage -- situations that are difficult to
produce on demand from a live service and trivial to produce from a fixture.

## The line these must not cross

A fixture adapter must be impossible to mistake for a live one. Every result it
returns carries `AdapterInfo(provider="fixture")`, and `is_available()` is true only
when fixture files actually exist. `TEAM_BUILD_GUIDE.md` is explicit that synthetic
data may be used only when visibly marked and never presented as artisan production
records. If a demo ever runs on these, the honest sentence is "this is a recorded
transcript", and the provider stamp in the response is what makes that checkable
rather than a matter of trust.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from ..contracts import AdapterInfo, AIError, ErrorCode, LowConfidenceSpan, TranscriptResult
from .base import AudioSource

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "asr"


def _audio_key(audio: AudioSource) -> str:
    """A stable key for a piece of audio.

    Content hash rather than filename, so the same recording resolves to the same
    fixture no matter where the caller spilled it to disk.
    """
    data = audio if isinstance(audio, bytes) else Path(audio).read_bytes()
    return hashlib.sha256(data).hexdigest()[:16]


class FixtureASRAdapter:
    """Replays a recorded `TranscriptResult` from `fixtures/asr/`.

    Resolution order:
      1. an explicit `key` argument, naming `<key>.json` directly;
      2. `index.json`, mapping an audio content hash to a fixture name;
      3. `default_key`, if the caller set one.

    Anything unresolved raises `PROVIDER_UNAVAILABLE` rather than returning an
    arbitrary fixture. Silently serving the wrong transcript is worse than failing,
    because the result looks entirely plausible.
    """

    name = "fixture"

    def __init__(self, fixture_dir: Path = FIXTURE_DIR, *, default_key: str | None = None):
        self.fixture_dir = Path(fixture_dir)
        self.default_key = default_key

    def is_available(self) -> bool:
        return self.fixture_dir.is_dir() and any(self.fixture_dir.glob("*.json"))

    def _index(self) -> dict[str, str]:
        index_path = self.fixture_dir / "index.json"
        if not index_path.exists():
            return {}
        return json.loads(index_path.read_text(encoding="utf-8"))

    def load(self, key: str) -> TranscriptResult:
        path = self.fixture_dir / f"{key}.json"
        if not path.exists():
            available = ", ".join(sorted(p.stem for p in self.fixture_dir.glob("*.json") if p.stem != "index"))
            raise AIError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                f"No ASR fixture named {key!r}. Available: {available or 'none'}",
                recoverable=False,
            )
        payload = json.loads(path.read_text(encoding="utf-8"))
        # Stamped here, not in the file: a fixture cannot claim to be Bhashini even if
        # somebody edits the JSON to say so.
        payload["adapter"] = AdapterInfo(provider=self.name, model=key, on_device=True).model_dump()
        return TranscriptResult.model_validate(payload)

    def transcribe(
        self,
        audio: AudioSource,
        *,
        declared_language: str | None = None,
        transcript_id: str | None = None,
        key: str | None = None,
    ) -> TranscriptResult:
        resolved = key or self._index().get(_audio_key(audio)) or self.default_key
        if resolved is None:
            raise AIError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                "No fixture matches this audio and no default fixture is set.",
                recoverable=False,
            )
        result = self.load(resolved)
        if transcript_id is not None:
            result = result.model_copy(update={"transcript_id": transcript_id})
        return result


class UnavailableASRAdapter:
    """Always unavailable. Exists so outage handling is testable without a network.

    Phase 3 of the build guide requires deliberately testing the no-provider path.
    Unplugging the wifi mid-suite is not a repeatable test; this is.
    """

    name = "unavailable"

    def __init__(self, reason: str = "Provider is not reachable."):
        self.reason = reason

    def is_available(self) -> bool:
        return False

    def transcribe(self, audio: AudioSource, **_: object) -> TranscriptResult:
        raise AIError(ErrorCode.PROVIDER_UNAVAILABLE, self.reason, recoverable=True, action="retry_later")


__all__ = ["FixtureASRAdapter", "UnavailableASRAdapter", "FIXTURE_DIR"]
