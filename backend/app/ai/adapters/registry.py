"""
Runtime provider selection.

The mechanism behind "providers are interchangeable at runtime". Adapters register a
factory under a name; callers ask for a name, or for the first available adapter from
an ordered preference list.

`resolve_asr` is the interesting one. It walks the preference list and returns the
first adapter whose `is_available()` is true, which is how the intended production
order works:

    bhashini -> local ASR fallback -> fixture

Bhashini first because public language infrastructure is the strategic claim, local
second because it keeps working when a government API is down, fixtures last because a
demo that cannot reach the network should degrade to something honest rather than to a
stack trace. The fallback is only ever included when the caller asks for it -- nothing
here silently substitutes recorded output for a live transcription.
"""

from __future__ import annotations

from typing import Callable, Iterable, TypeVar

from ..contracts import AIError, ErrorCode

T = TypeVar("T")

_ASR: dict[str, Callable[[], object]] = {}


def register_asr(name: str, factory: Callable[[], object]) -> None:
    """Register lazily. Factories are not called until an adapter is actually wanted.

    This matters because constructing a local ASR adapter loads model weights. Eager
    construction would make importing this module slow and would make an unused
    provider's missing dependency everybody's problem.
    """
    _ASR[name] = factory


def available_asr() -> list[str]:
    return sorted(_ASR)


def get_asr(name: str):
    if name not in _ASR:
        raise AIError(
            ErrorCode.PROVIDER_UNAVAILABLE,
            f"No ASR adapter registered under {name!r}. Registered: {', '.join(available_asr()) or 'none'}",
            recoverable=False,
        )
    return _ASR[name]()


def resolve_asr(preference: Iterable[str]):
    """First adapter in `preference` that reports itself available.

    Raises rather than returning None: a caller that has to check for None will
    eventually forget, and the failure would surface as a confusing attribute error
    deep in a worker instead of a contract error the app can render.
    """
    tried: list[str] = []
    for name in preference:
        tried.append(name)
        if name not in _ASR:
            continue
        adapter = _ASR[name]()
        if adapter.is_available():
            return adapter
    raise AIError(
        ErrorCode.PROVIDER_UNAVAILABLE,
        f"No speech provider is available. Tried: {', '.join(tried) or 'nothing'}.",
        recoverable=True,
        action="retry_later",
    )
