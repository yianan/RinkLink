from __future__ import annotations

import os

from ..config import settings


def assert_auth_runtime_safe() -> None:
    if settings.app_env != "development" and not settings.auth_enabled:
        raise RuntimeError("AUTH_ENABLED may only be disabled when APP_ENV=development")

    if settings.auth_bypass_dev_only:
        if settings.app_env != "development":
            raise RuntimeError("AUTH_BYPASS_DEV_ONLY may only be enabled when APP_ENV=development")
        if os.getenv("RENDER", "").strip().lower() in {"1", "true", "yes"}:
            raise RuntimeError("AUTH_BYPASS_DEV_ONLY cannot be enabled on Render")
        if os.getenv("CI", "").strip().lower() in {"1", "true", "yes"}:
            raise RuntimeError("AUTH_BYPASS_DEV_ONLY cannot be enabled in CI")

    if settings.auth_enabled:
        missing = [
            name
            for name, value in (
                ("AUTH_JWKS_URL", settings.auth_jwks_url),
                ("AUTH_ISSUER", settings.auth_issuer),
                ("AUTH_AUDIENCE", settings.auth_audience),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"AUTH_ENABLED=true requires {', '.join(missing)}")
