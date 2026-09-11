"""
Adapter layer.

These tests are about the seam, not about any provider. They assert that the seam
holds: that implementations satisfy the Protocol, that selection falls back rather
than exploding, and that a fixture can never impersonate a live provider.
"""

from __future__ import annotations

import pytest

from app.ai.adapters import (
    DEFAULT_ASR_PREFERENCE,
    FixtureASRAdapter,
    LocalWhisperASRAdapter,
    UnavailableASRAdapter,
    available_asr,
    register_asr,
    resolve_asr,
)
from app.ai.adapters.base import ASRAdapter
from app.ai.contracts import AIError, ErrorCode, TranscriptResult


def test_implementations_satisfy_the_protocol():
    """Structural conformance, checked rather than assumed."""
    for adapter in (FixtureASRAdapter(), LocalWhisperASRAdapter(), UnavailableASRAdapter()):
        assert isinstance(adapter, ASRAdapter)


def test_fixture_adapter_replays_a_recorded_transcript():
    result = FixtureASRAdapter().transcribe(b"ignored", key="kn_clean_saree")
    assert isinstance(result, TranscriptResult)
    assert result.detected_language == "kn"
    assert result.original_text
    assert result.english_translation
    assert result.needs_replay is False


def test_low_confidence_fixture_requests_confirmation():
    """The case the confirmation screen exists for.

    An uncertain word here is a word that would otherwise become a published claim.
    """
    result = FixtureASRAdapter().transcribe(b"ignored", key="kn_low_confidence_material")
    assert result.needs_replay is True
    assert result.low_confidence_spans[0].confidence < 0.6
    assert result.low_confidence_spans[0].reason


def test_fixture_cannot_claim_to_be_a_live_provider(tmp_path):
    """Provider identity is stamped by the adapter, not read from the file."""
    import json

    payload = json.loads(
        (FixtureASRAdapter().fixture_dir / "kn_clean_saree.json").read_text(encoding="utf-8")
    )
    payload["adapter"] = {"provider": "bhashini", "model": "very-real", "on_device": False}
    (tmp_path / "forged.json").write_text(json.dumps(payload), encoding="utf-8")

    result = FixtureASRAdapter(tmp_path).transcribe(b"ignored", key="forged")
    assert result.adapter.provider == "fixture"


def test_unknown_fixture_raises_rather_than_serving_something_plausible():
    with pytest.raises(AIError) as excinfo:
        FixtureASRAdapter().transcribe(b"ignored", key="no_such_fixture")
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE


def test_unmatched_audio_with_no_default_raises():
    with pytest.raises(AIError):
        FixtureASRAdapter().transcribe(b"audio that matches no index entry")


def test_default_key_is_used_when_the_index_does_not_match():
    result = FixtureASRAdapter(default_key="kn_code_mixed").transcribe(b"unindexed audio")
    assert result.transcript_id == "T-FIXTURE-0003"


def test_transcript_id_can_be_overridden_by_the_caller():
    """The backend owns ids; an adapter's own id is a fallback, not an authority."""
    result = FixtureASRAdapter().transcribe(b"x", key="kn_clean_saree", transcript_id="T-REAL-9")
    assert result.transcript_id == "T-REAL-9"


def test_registry_falls_back_past_an_unavailable_provider():
    register_asr("always_down", lambda: UnavailableASRAdapter())
    register_asr("test_fixture", lambda: FixtureASRAdapter())
    adapter = resolve_asr(["always_down", "test_fixture"])
    assert adapter.name == "fixture"


def test_registry_skips_names_that_are_not_registered():
    """`bhashini` is in the default order and not yet implemented. That must be fine."""
    register_asr("test_fixture", lambda: FixtureASRAdapter())
    assert resolve_asr(["bhashini", "test_fixture"]).name == "fixture"


def test_no_available_provider_raises_a_contract_error_not_none():
    register_asr("always_down", lambda: UnavailableASRAdapter())
    with pytest.raises(AIError) as excinfo:
        resolve_asr(["always_down", "also_missing"])
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert excinfo.value.recoverable is True


def test_bhashini_leads_the_default_preference_order():
    """Public language rails are the strategic claim; the order encodes it."""
    assert DEFAULT_ASR_PREFERENCE[0] == "bhashini"
    assert "fixture" not in DEFAULT_ASR_PREFERENCE, (
        "recorded output must never be selected automatically"
    )


def test_local_asr_reports_availability_without_downloading_a_model():
    """`is_available()` must be cheap and side-effect free; the registry calls it often."""
    assert LocalWhisperASRAdapter().is_available() is LocalWhisperASRAdapter.dependency_installed()


@pytest.mark.skipif(
    not LocalWhisperASRAdapter.dependency_installed(),
    reason="faster-whisper is not installed",
)
def test_local_asr_confidence_maps_log_probability_into_zero_to_one():
    from app.ai.adapters.local_asr import _confidence_from_logprob

    assert _confidence_from_logprob(None) == 0.0
    assert _confidence_from_logprob(0.0) == 1.0
    assert 0.0 < _confidence_from_logprob(-1.0) < 1.0
    assert _confidence_from_logprob(-50.0) >= 0.0
