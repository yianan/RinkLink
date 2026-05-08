from __future__ import annotations

import time
from collections.abc import Callable
from threading import RLock
from typing import TypeVar

T = TypeVar("T")

_cache: dict[str, tuple[float, object]] = {}
_lock = RLock()


def ttl_get_or_set(key: str, ttl_seconds: float, factory: Callable[[], T]) -> T:
    now = time.monotonic()
    with _lock:
        entry = _cache.get(key)
        if entry:
            expires_at, value = entry
            if expires_at > now:
                return value  # type: ignore[return-value]
            _cache.pop(key, None)

    value = factory()
    with _lock:
        _cache[key] = (now + ttl_seconds, value)
    return value


def ttl_clear_prefix(prefix: str) -> None:
    with _lock:
        for key in list(_cache):
            if key.startswith(prefix):
                _cache.pop(key, None)
