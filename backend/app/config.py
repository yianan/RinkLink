import os
from pathlib import Path
from urllib.parse import urlparse

from pydantic import BaseModel


class Settings(BaseModel):
    app_env: str
    database_url: str
    cors_origins: list[str]
    media_root: Path
    frontend_url: str
    auth_enabled: bool
    auth_bypass_dev_only: bool
    auth_require_mfa_for_privileged: bool
    auth_internal_base_url: str | None
    auth_jwks_url: str | None
    auth_issuer: str | None
    auth_audience: str | None
    email_from_name: str
    email_from_address: str | None
    brevo_api_key: str | None
    brevo_api_url: str
    smtp_host: str | None
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    smtp_starttls: bool
    smtp_use_ssl: bool
    calendar_token_secret: str | None


def _load_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalize_http_url(value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip().rstrip("/")
    if not stripped:
        return None
    if "://" not in stripped:
        stripped = f"http://{stripped}"
    return stripped


def _normalize_scalar(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _origin_from_url(value: str | None) -> str | None:
    normalized = _normalize_http_url(value)
    if not normalized:
        return None
    parsed = urlparse(normalized)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _load() -> Settings:
    app_env = os.getenv("APP_ENV", "development").strip().lower() or "development"
    render_external_url = _normalize_http_url(os.getenv("RENDER_EXTERNAL_URL"))
    default_sqlite_path = Path(__file__).resolve().parents[1] / "rinklink.db"
    db_url = os.getenv("DATABASE_URL", f"sqlite:///{default_sqlite_path}")

    # Some hosted platforms expose Postgres URLs as postgres:// or postgresql://.
    # SQLAlchemy needs an explicit driver, so we normalize both to psycopg v3.
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

    cors_default = (
        render_external_url
        or "http://localhost:5173,http://localhost:5174"
    )
    cors_raw = os.getenv("CORS_ORIGINS", cors_default)
    cors = [o.strip() for o in cors_raw.split(",") if o.strip()]
    default_media_root = Path(__file__).resolve().parents[1] / "media"
    media_root = Path(os.getenv("MEDIA_ROOT", str(default_media_root))).expanduser()
    frontend_url = (
        _normalize_http_url(os.getenv("FRONTEND_URL"))
        or render_external_url
        or (cors[0] if cors else "http://localhost:5173")
    )
    auth_enabled = _load_bool("AUTH_ENABLED", app_env != "development")
    auth_bypass_dev_only = _load_bool("AUTH_BYPASS_DEV_ONLY", False)
    auth_require_mfa_for_privileged = _load_bool("AUTH_REQUIRE_MFA_FOR_PRIVILEGED", False)
    auth_internal_base_url = (
        _normalize_http_url(os.getenv("AUTH_INTERNAL_BASE_URL"))
        or _origin_from_url(os.getenv("AUTH_JWKS_URL"))
    )
    auth_jwks_url = (
        _normalize_http_url(os.getenv("AUTH_JWKS_URL"))
        or (f"{auth_internal_base_url}/.well-known/jwks.json" if auth_internal_base_url else None)
    )
    auth_issuer = _normalize_http_url(os.getenv("AUTH_ISSUER")) or render_external_url
    auth_audience = _normalize_scalar(os.getenv("AUTH_AUDIENCE"))
    if app_env != "development" and auth_jwks_url:
        parsed_jwks_url = urlparse(auth_jwks_url)
        if parsed_jwks_url.scheme != "https":
            raise RuntimeError("AUTH_JWKS_URL must use https outside development")
    email_from_name = os.getenv("EMAIL_FROM_NAME", "RinkLink").strip() or "RinkLink"
    email_from_address = (os.getenv("EMAIL_FROM_ADDRESS") or "").strip() or None
    brevo_api_key = (os.getenv("BREVO_API_KEY") or "").strip() or None
    brevo_api_url = (
        _normalize_http_url(os.getenv("BREVO_API_URL"))
        or "https://api.brevo.com/v3/smtp/email"
    )
    smtp_host = (os.getenv("SMTP_HOST") or "").strip() or None
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = (os.getenv("SMTP_USERNAME") or "").strip() or None
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_starttls = _load_bool("SMTP_STARTTLS", True)
    smtp_use_ssl = _load_bool("SMTP_USE_SSL", False)
    calendar_token_secret = _normalize_scalar(os.getenv("CALENDAR_TOKEN_SECRET")) or (
        db_url if app_env == "development" else None
    )

    return Settings(
        app_env=app_env,
        database_url=db_url,
        cors_origins=cors,
        media_root=media_root,
        frontend_url=frontend_url,
        auth_enabled=auth_enabled,
        auth_bypass_dev_only=auth_bypass_dev_only,
        auth_require_mfa_for_privileged=auth_require_mfa_for_privileged,
        auth_internal_base_url=auth_internal_base_url,
        auth_jwks_url=auth_jwks_url,
        auth_issuer=auth_issuer,
        auth_audience=auth_audience,
        email_from_name=email_from_name,
        email_from_address=email_from_address,
        brevo_api_key=brevo_api_key,
        brevo_api_url=brevo_api_url,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_username=smtp_username,
        smtp_password=smtp_password,
        smtp_starttls=smtp_starttls,
        smtp_use_ssl=smtp_use_ssl,
        calendar_token_secret=calendar_token_secret,
    )


settings = _load()
