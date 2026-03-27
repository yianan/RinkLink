import os
from pathlib import Path

from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str
    cors_origins: list[str]
    media_root: Path


def _load() -> Settings:
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

    return Settings(database_url=db_url, cors_origins=cors, media_root=media_root)


settings = _load()
