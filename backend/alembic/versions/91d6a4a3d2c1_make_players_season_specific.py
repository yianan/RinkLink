"""make players season specific

Revision ID: 91d6a4a3d2c1
Revises: f4c8129d7a61
Create Date: 2026-03-10 16:25:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "91d6a4a3d2c1"
down_revision: Union[str, Sequence[str], None] = "f4c8129d7a61"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    seasons = sa.Table("seasons", metadata, autoload_with=bind)

    default_season_id = bind.execute(
        sa.select(seasons.c.id)
        .order_by(seasons.c.is_active.desc(), seasons.c.start_date.desc(), seasons.c.created_at.desc())
        .limit(1)
    ).scalar()
    if not default_season_id:
        raise RuntimeError("Cannot backfill players.season_id without at least one season")

    with op.batch_alter_table("players") as batch_op:
        batch_op.add_column(sa.Column("season_id", sa.String(length=36), nullable=True))

    players = sa.Table("players", sa.MetaData(), autoload_with=bind)
    bind.execute(sa.update(players).values(season_id=default_season_id))

    with op.batch_alter_table("players") as batch_op:
        batch_op.drop_index("ix_players_team_last_first")
        batch_op.create_foreign_key(
            "fk_players_season_id_seasons",
            "seasons",
            ["season_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.alter_column("season_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.create_index(
            "ix_players_team_season_last_first",
            ["team_id", "season_id", "last_name", "first_name"],
        )


def downgrade() -> None:
    # Season-specific roster history is intentionally not downgraded away.
    pass
