"""Refuse to run minimal-schema migrations against the full application database."""
import os
from sqlalchemy import inspect, text

REMOVED_TABLES = {"players", "associations", "competitions", "ice_slots", "ice_booking_requests", "event_attendance"}


def assert_minimal_database(engine):
    with engine.connect() as connection:
        names = set(inspect(connection).get_table_names())
        if names & REMOVED_TABLES:
            raise RuntimeError("Full-app database detected. Configure a dedicated RinkLink minimal database.")
        if "alembic_version" in names:
            revisions = connection.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
            if any(not revision.startswith("mini_") for revision in revisions):
                raise RuntimeError("Full-app migration lineage detected. Use a new minimal database.")
    if os.getenv("APP_ENV", "development") != "development" and os.getenv("RINKLINK_VARIANT") != "minimal":
        raise RuntimeError("Production requires RINKLINK_VARIANT=minimal and a dedicated database.")
