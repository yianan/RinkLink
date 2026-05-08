from __future__ import annotations

from app.config import _load


def test_calendar_secret_falls_back_to_better_auth_secret_in_production(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example.com/rinklink")
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://rinklink.example.com")
    monkeypatch.setenv("AUTH_JWKS_URL", "https://rinklink.example.com/.well-known/jwks.json")
    monkeypatch.setenv("BETTER_AUTH_SECRET", "auth-secret-for-calendar")
    monkeypatch.delenv("CALENDAR_TOKEN_SECRET", raising=False)

    settings = _load()

    assert settings.calendar_token_secret == "auth-secret-for-calendar"


def test_calendar_secret_prefers_explicit_value(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example.com/rinklink")
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://rinklink.example.com")
    monkeypatch.setenv("AUTH_JWKS_URL", "https://rinklink.example.com/.well-known/jwks.json")
    monkeypatch.setenv("BETTER_AUTH_SECRET", "auth-secret-for-calendar")
    monkeypatch.setenv("CALENDAR_TOKEN_SECRET", "calendar-secret")

    settings = _load()

    assert settings.calendar_token_secret == "calendar-secret"
