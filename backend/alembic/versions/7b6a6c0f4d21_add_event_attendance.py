"""add event attendance

Revision ID: 7b6a6c0f4d21
Revises: 092fd6e43b19
Create Date: 2026-03-27 17:55:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b6a6c0f4d21"
down_revision: Union[str, Sequence[str], None] = "092fd6e43b19"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "event_attendance" not in inspector.get_table_names():
        op.create_table(
            "event_attendance",
            sa.Column("event_id", sa.String(length=36), nullable=False),
            sa.Column("player_id", sa.String(length=36), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("responded_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("event_id", "player_id"),
        )
        inspector = sa.inspect(bind)

    existing_indexes = {index["name"] for index in inspector.get_indexes("event_attendance")}
    if "ix_event_attendance_event_status" not in existing_indexes:
        op.create_index("ix_event_attendance_event_status", "event_attendance", ["event_id", "status"], unique=False)
    if "ix_event_attendance_player" not in existing_indexes:
        op.create_index("ix_event_attendance_player", "event_attendance", ["player_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_event_attendance_player", table_name="event_attendance")
    op.drop_index("ix_event_attendance_event_status", table_name="event_attendance")
    op.drop_table("event_attendance")
