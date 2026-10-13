from __future__ import annotations

from collections.abc import Generator
from pathlib import Path
import sys
import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.models  # noqa: F401
from app.database import Base


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    test_url = os.getenv('RINKLINK_TEST_DATABASE_URL')
    if test_url:
        # Integration runs must use the explicitly isolated local test database.
        if '127.0.0.1:16432/rinklink_minimal_check' not in test_url:
            raise RuntimeError('Use the isolated rinklink_minimal_check database on port 16432')
        engine = create_engine(test_url)
    else:
        engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
