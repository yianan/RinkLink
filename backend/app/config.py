import os
from pathlib import Path

from pydantic import BaseModel


class Settings(BaseModel):
    app_env: str
    database_url: str
    cors_origins: list[str]
    media_root: Path
    auth_enabled: bool
    auth_bypass_dev_only: bool
    auth_jwks_url: str | None
    auth_issuer: str | None
    auth_audience: str | None


def _load_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _load() -> Settings:
    app_env = os.getenv("APP_ENV", "development").strip().lower() or "development"
    default_sqlite_path = Path(__file__).resolve().parents[1] / "rinklink.db"
    db_url = os.getenv("DATABASE_URL", f"sqlite:///{default_sqlite_path}")

    # Some hosted platforms expose Postgres URLs as postgres:// or postgresql://.
    # SQLAlchemy needs an explicit driver, so we normalize both to psycopg v3.
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

    cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
    cors = [o.strip() for o in cors_raw.split(",") if o.strip()]
    default_media_root = Path(__file__).resolve().parents[1] / "media"
    media_root = Path(os.getenv("MEDIA_ROOT", str(default_media_root))).expanduser()
    auth_enabled = _load_bool("AUTH_ENABLED", False)
    auth_bypass_dev_only = _load_bool("AUTH_BYPASS_DEV_ONLY", False)
    auth_jwks_url = os.getenv("AUTH_JWKS_URL")
    auth_issuer = os.getenv("AUTH_ISSUER")
    auth_audience = os.getenv("AUTH_AUDIENCE")

    return Settings(
        app_env=app_env,
        database_url=db_url,
        cors_origins=cors,
        media_root=media_root,
        auth_enabled=auth_enabled,
        auth_bypass_dev_only=auth_bypass_dev_only,
        auth_jwks_url=auth_jwks_url,
        auth_issuer=auth_issuer,
        auth_audience=auth_audience,
    )


settings = _load()
