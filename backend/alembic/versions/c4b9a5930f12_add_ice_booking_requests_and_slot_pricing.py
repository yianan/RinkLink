"""add ice booking requests and slot pricing

Revision ID: c4b9a5930f12
Revises: 7b6a6c0f4d21
Create Date: 2026-03-27 21:30:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4b9a5930f12"
down_revision: Union[str, Sequence[str], None] = "7b6a6c0f4d21"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_columns = _column_names(inspector, "ice_slots")
    if "pricing_mode" not in existing_columns:
        op.add_column("ice_slots", sa.Column("pricing_mode", sa.String(length=30), nullable=False, server_default="call_for_pricing"))
    if "price_amount_cents" not in existing_columns:
        op.add_column("ice_slots", sa.Column("price_amount_cents", sa.Integer(), nullable=True))
    if "currency" not in existing_columns:
        op.add_column("ice_slots", sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"))

    inspector = sa.inspect(bind)
    if "ice_booking_requests" not in inspector.get_table_names():
        op.create_table(
            "ice_booking_requests",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("requester_team_id", sa.String(length=36), nullable=False),
            sa.Column("away_team_id", sa.String(length=36), nullable=True),
            sa.Column("season_id", sa.String(length=36), nullable=True),
            sa.Column("event_type", sa.String(length=30), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="requested"),
            sa.Column("arena_id", sa.String(length=36), nullable=False),
            sa.Column("arena_rink_id", sa.String(length=36), nullable=False),
            sa.Column("ice_slot_id", sa.String(length=36), nullable=False),
            sa.Column("event_id", sa.String(length=36), nullable=True),
            sa.Column("pricing_mode", sa.String(length=30), nullable=False),
            sa.Column("price_amount_cents", sa.Integer(), nullable=True),
            sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
            sa.Column("final_price_amount_cents", sa.Integer(), nullable=True),
            sa.Column("final_currency", sa.String(length=3), nullable=True),
            sa.Column("home_locker_room_id", sa.String(length=36), nullable=True),
            sa.Column("away_locker_room_id", sa.String(length=36), nullable=True),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("response_message", sa.Text(), nullable=True),
            sa.Column("responded_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["arena_id"], ["arenas.id"]),
            sa.ForeignKeyConstraint(["arena_rink_id"], ["arena_rinks.id"]),
            sa.ForeignKeyConstraint(["away_team_id"], ["teams.id"]),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"]),
            sa.ForeignKeyConstraint(["home_locker_room_id"], ["locker_rooms.id"]),
            sa.ForeignKeyConstraint(["away_locker_room_id"], ["locker_rooms.id"]),
            sa.ForeignKeyConstraint(["ice_slot_id"], ["ice_slots.id"]),
            sa.ForeignKeyConstraint(["requester_team_id"], ["teams.id"]),
            sa.ForeignKeyConstraint(["season_id"], ["seasons.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("event_id"),
        )

    inspector = sa.inspect(bind)
    existing_indexes = {index["name"] for index in inspector.get_indexes("ice_booking_requests")}
    if "ix_ice_booking_requests_team_status" not in existing_indexes:
        op.create_index("ix_ice_booking_requests_team_status", "ice_booking_requests", ["requester_team_id", "status"], unique=False)
    if "ix_ice_booking_requests_arena_status" not in existing_indexes:
        op.create_index("ix_ice_booking_requests_arena_status", "ice_booking_requests", ["arena_id", "status"], unique=False)
    if "ix_ice_booking_requests_slot_status" not in existing_indexes:
        op.create_index("ix_ice_booking_requests_slot_status", "ice_booking_requests", ["ice_slot_id", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ice_booking_requests_slot_status", table_name="ice_booking_requests")
    op.drop_index("ix_ice_booking_requests_arena_status", table_name="ice_booking_requests")
    op.drop_index("ix_ice_booking_requests_team_status", table_name="ice_booking_requests")
    op.drop_table("ice_booking_requests")
    op.drop_column("ice_slots", "currency")
    op.drop_column("ice_slots", "price_amount_cents")
    op.drop_column("ice_slots", "pricing_mode")
