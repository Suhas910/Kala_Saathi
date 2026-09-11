"""
Provider adapters.

Import this package to get the standard registrations. The intended production
preference order is::

    from app.ai.adapters import DEFAULT_ASR_PREFERENCE, resolve_asr
    adapter = resolve_asr(DEFAULT_ASR_PREFERENCE)

`bhashini` is first in that list and is **not yet implemented** -- it needs a ULCA
registration that is not in the team's control. `resolve_asr` skips unregistered names,
so the list already describes the intended order and will start using Bhashini the day
the adapter lands, with no caller changing.
"""

from .base import ASRAdapter, AudioSource, CatalogueGeneratorAdapter, TranslationAdapter
from .fixture import FixtureASRAdapter, UnavailableASRAdapter
from .local_asr import LocalWhisperASRAdapter
from .registry import available_asr, get_asr, register_asr, resolve_asr

# Bhashini first: public language infrastructure is the strategic claim, not a
# convenience. Local next, so a portal outage cannot stop an artisan mid-listing.
# Fixtures are never in the default order -- a caller that wants recorded output has to
# ask for it by name.
DEFAULT_ASR_PREFERENCE = ("bhashini", "local_whisper")

register_asr("local_whisper", LocalWhisperASRAdapter)
register_asr("fixture", FixtureASRAdapter)

__all__ = [
    "ASRAdapter",
    "AudioSource",
    "CatalogueGeneratorAdapter",
    "DEFAULT_ASR_PREFERENCE",
    "FixtureASRAdapter",
    "LocalWhisperASRAdapter",
    "TranslationAdapter",
    "UnavailableASRAdapter",
    "available_asr",
    "get_asr",
    "register_asr",
    "resolve_asr",
]
