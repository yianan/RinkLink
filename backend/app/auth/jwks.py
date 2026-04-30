from __future__ import annotations

import time
from threading import Lock

import httpx
import jwt as pyjwt

from ..config import settings

_CACHE_TTL_SECONDS = 600
_NEGATIVE_CACHE_SECONDS = 60
_cached_keys: dict[str, object] = {}
_cached_until = 0.0
_negative_cached_until = 0.0
_client: httpx.Client | None = None
_client_lock = Lock()


def _jwks_client() -> httpx.Client:
    global _client
    with _client_lock:
        if _client is None:
            _client = httpx.Client(timeout=5.0)
        return _client


def _refresh_jwks(*, force: bool = False) -> None:
    global _cached_keys, _cached_until, _negative_cached_until

    if not settings.auth_jwks_url:
        raise RuntimeError("AUTH_JWKS_URL is required when authentication is enabled")

    now = time.time()
    if not force and now < _negative_cached_until:
        raise RuntimeError("JWKS refresh is temporarily suppressed after a recent failure")

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = _jwks_client().get(settings.auth_jwks_url)
            response.raise_for_status()
            payload = response.json()
            keys = payload.get("keys", [])
            _cached_keys = {
                key["kid"]: pyjwt.PyJWK.from_dict(key).key
                for key in keys
                if key.get("kid")
            }
            _cached_until = time.time() + _CACHE_TTL_SECONDS
            _negative_cached_until = 0.0
            return
        except Exception as exc:  # pragma: no cover - exercised through get_signing_key
            last_error = exc
            if attempt < 2:
                time.sleep(0.25 * (2 ** attempt))

    _negative_cached_until = time.time() + _NEGATIVE_CACHE_SECONDS
    if _cached_keys:
        _cached_until = _negative_cached_until
    raise RuntimeError("Unable to refresh JWKS") from last_error


def get_signing_key(kid: str) -> object:
    if not kid:
        raise RuntimeError("JWT header missing key id")

    if time.time() >= _cached_until:
        try:
            _refresh_jwks()
        except RuntimeError:
            stale_key = _cached_keys.get(kid)
            if stale_key is not None:
                return stale_key
            raise

    key = _cached_keys.get(kid)
    if key is None:
        _refresh_jwks(force=True)
        key = _cached_keys.get(kid)
    if key is None:
        raise RuntimeError(f"Unable to resolve JWKS signing key for kid={kid}")
    return key
