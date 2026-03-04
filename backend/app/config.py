import os

from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str
    cors_origins: list[str]


def _load() -> Settings:
    db_url = os.getenv("DATABASE_URL", "sqlite:///./rinklink.db")

    # Railway (and Heroku) emit postgres:// but SQLAlchemy needs postgresql+<driver>://.
    # We standardize on psycopg (v3) for clean installs on newer Python versions (ex: 3.14).
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

    cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174")
    cors = [o.strip() for o in cors_raw.split(",") if o.strip()]

    return Settings(database_url=db_url, cors_origins=cors)


settings = _load()
