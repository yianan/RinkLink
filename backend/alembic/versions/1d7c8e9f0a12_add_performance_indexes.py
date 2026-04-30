"""add performance indexes

Revision ID: 1d7c8e9f0a12
Revises: 9a2c7d1e5b44
Create Date: 2026-04-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "1d7c8e9f0a12"
down_revision: Union[str, Sequence[str], None] = "9a2c7d1e5b44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_availability_match_lookup",
        "availability_windows",
        ["date", "start_time", "availability_type", "status", "blocked", "season_id"],
    )
    op.create_index("ix_events_arena_date_status", "events", ["arena_id", "date", "status"])
    op.create_index("ix_events_season_date", "events", ["season_id", "date"])
    op.create_index("ix_events_home_window_status", "events", ["home_availability_window_id", "status"])
    op.create_index("ix_events_away_window_status", "events", ["away_availability_window_id", "status"])
    op.create_index("ix_events_ice_slot_status", "events", ["ice_slot_id", "status"])
    op.create_index("ix_proposals_home_window_status", "proposals", ["home_availability_window_id", "status"])
    op.create_index("ix_proposals_away_window_status", "proposals", ["away_availability_window_id", "status"])
    op.create_index("ix_proposals_home_team_status_date", "proposals", ["home_team_id", "status", "proposed_date"])
    op.create_index("ix_proposals_away_team_status_date", "proposals", ["away_team_id", "status", "proposed_date"])
    op.create_index("ix_proposals_slot_status", "proposals", ["ice_slot_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_proposals_slot_status", table_name="proposals")
    op.drop_index("ix_proposals_away_team_status_date", table_name="proposals")
    op.drop_index("ix_proposals_home_team_status_date", table_name="proposals")
    op.drop_index("ix_proposals_away_window_status", table_name="proposals")
    op.drop_index("ix_proposals_home_window_status", table_name="proposals")
    op.drop_index("ix_events_ice_slot_status", table_name="events")
    op.drop_index("ix_events_away_window_status", table_name="events")
    op.drop_index("ix_events_home_window_status", table_name="events")
    op.drop_index("ix_events_season_date", table_name="events")
    op.drop_index("ix_events_arena_date_status", table_name="events")
    op.drop_index("ix_availability_match_lookup", table_name="availability_windows")
