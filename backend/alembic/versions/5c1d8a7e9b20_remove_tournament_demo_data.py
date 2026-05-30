"""remove tournament demo data

Revision ID: 5c1d8a7e9b20
Revises: 6a8e3f1b2c90
Create Date: 2026-05-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "5c1d8a7e9b20"
down_revision: Union[str, Sequence[str], None] = "6a8e3f1b2c90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TOURNAMENT_TYPES = "('tournament', 'state_tournament')"
TOURNAMENT_EVENT_IDS = f"""
    SELECT events.id
    FROM events
    LEFT JOIN competition_divisions ON competition_divisions.id = events.competition_division_id
    LEFT JOIN competitions ON competitions.id = competition_divisions.competition_id
    WHERE events.event_type IN {TOURNAMENT_TYPES}
       OR competitions.competition_type IN {TOURNAMENT_TYPES}
"""


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE ice_slots
        SET status = 'available', booked_by_team_id = NULL
        WHERE id IN (
            SELECT ice_slot_id FROM events
            WHERE id IN ({TOURNAMENT_EVENT_IDS}) AND ice_slot_id IS NOT NULL
            UNION
            SELECT ice_slot_id FROM ice_booking_requests
            WHERE event_type IN {TOURNAMENT_TYPES}
               OR event_id IN ({TOURNAMENT_EVENT_IDS})
            UNION
            SELECT ice_slot_id FROM proposals
            WHERE event_type IN {TOURNAMENT_TYPES} AND ice_slot_id IS NOT NULL
        )
        """
    )
    op.execute(
        f"""
        UPDATE availability_windows
        SET status = 'open', opponent_team_id = NULL
        WHERE id IN (
            SELECT home_availability_window_id FROM events
            WHERE id IN ({TOURNAMENT_EVENT_IDS}) AND home_availability_window_id IS NOT NULL
            UNION
            SELECT away_availability_window_id FROM events
            WHERE id IN ({TOURNAMENT_EVENT_IDS}) AND away_availability_window_id IS NOT NULL
        )
        """
    )
    op.execute(
        f"""
        DELETE FROM ice_booking_requests
        WHERE event_type IN {TOURNAMENT_TYPES}
           OR event_id IN ({TOURNAMENT_EVENT_IDS})
        """
    )
    op.execute(f"DELETE FROM event_attendance WHERE event_id IN ({TOURNAMENT_EVENT_IDS})")
    op.execute(f"DELETE FROM event_player_stats WHERE event_id IN ({TOURNAMENT_EVENT_IDS})")
    op.execute(f"DELETE FROM event_penalties WHERE event_id IN ({TOURNAMENT_EVENT_IDS})")
    op.execute(f"DELETE FROM event_goalie_stats WHERE event_id IN ({TOURNAMENT_EVENT_IDS})")
    op.execute(f"DELETE FROM event_signatures WHERE event_id IN ({TOURNAMENT_EVENT_IDS})")
    op.execute(f"DELETE FROM events WHERE id IN ({TOURNAMENT_EVENT_IDS})")
    op.execute(
        f"""
        UPDATE events
        SET proposal_id = NULL
        WHERE proposal_id IN (
            SELECT id FROM proposals WHERE event_type IN {TOURNAMENT_TYPES}
        )
        """
    )
    op.execute(
        f"""
        UPDATE proposals
        SET thread_root_proposal_id = NULL, parent_proposal_id = NULL
        WHERE thread_root_proposal_id IN (
            SELECT id FROM proposals WHERE event_type IN {TOURNAMENT_TYPES}
        )
           OR parent_proposal_id IN (
            SELECT id FROM proposals WHERE event_type IN {TOURNAMENT_TYPES}
        )
        """
    )
    op.execute(f"DELETE FROM proposals WHERE event_type IN {TOURNAMENT_TYPES}")
    op.execute(
        f"""
        DELETE FROM team_competition_memberships
        WHERE competition_division_id IN (
            SELECT competition_divisions.id
            FROM competition_divisions
            JOIN competitions ON competitions.id = competition_divisions.competition_id
            WHERE competitions.competition_type IN {TOURNAMENT_TYPES}
        )
        """
    )
    op.execute(
        f"""
        DELETE FROM competition_divisions
        WHERE competition_id IN (
            SELECT id FROM competitions WHERE competition_type IN {TOURNAMENT_TYPES}
        )
        """
    )
    op.execute(f"DELETE FROM competitions WHERE competition_type IN {TOURNAMENT_TYPES}")


def downgrade() -> None:
    pass
