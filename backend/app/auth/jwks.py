from __future__ import annotations

import time

import httpx
import jwt as pyjwt

from ..config import settings

_CACHE_TTL_SECONDS = 3600
_cached_keys: dict[str, object] = {}
_cached_until = 0.0


def _refresh_jwks() -> None:
    global _cached_keys, _cached_until

    if not settings.auth_jwks_url:
        raise RuntimeError("AUTH_JWKS_URL is required when authentication is enabled")

    response = httpx.get(settings.auth_jwks_url, timeout=5.0)
    response.raise_for_status()
    payload = response.json()
    keys = payload.get("keys", [])
    _cached_keys = {
        key["kid"]: pyjwt.PyJWK.from_dict(key).key
        for key in keys
        if key.get("kid")
    }
    _cached_until = time.time() + _CACHE_TTL_SECONDS


def get_signing_key(kid: str) -> object:
    if not kid:
        raise RuntimeError("JWT header missing key id")

    if time.time() >= _cached_until:
        _refresh_jwks()

    key = _cached_keys.get(kid)
    if key is None:
        _refresh_jwks()
        key = _cached_keys.get(kid)
    if key is None:
        raise RuntimeError(f"Unable to resolve JWKS signing key for kid={kid}")
    return key
