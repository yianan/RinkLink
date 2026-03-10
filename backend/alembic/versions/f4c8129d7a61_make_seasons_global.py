"""make seasons global

Revision ID: f4c8129d7a61
Revises: d5e7f1a23b44
Create Date: 2026-03-10 13:15:00.000000

"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4c8129d7a61"
down_revision: Union[str, Sequence[str], None] = "d5e7f1a23b44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEASON_START_MONTH = 8
PRECREATE_NEXT_SEASON_MONTH = 7


def _season_start_year_for_date(target_date: dt.date) -> int:
    return target_date.year if target_date.month >= SEASON_START_MONTH else target_date.year - 1


def _canonical_bounds(start_year: int) -> tuple[dt.date, dt.date]:
    return dt.date(start_year, SEASON_START_MONTH, 1), dt.date(start_year + 1, SEASON_START_MONTH - 1, 31)


def _canonical_name(start_year: int) -> str:
    return f"{start_year}-{start_year + 1}"


def _infer_start_year(start_date: dt.date, end_date: dt.date) -> int:
    return start_date.year if start_date.month >= SEASON_START_MONTH else end_date.year - 1


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    associations = sa.Table("associations", metadata, autoload_with=bind)
    seasons = sa.Table("seasons", metadata, autoload_with=bind)
    games = sa.Table("games", metadata, autoload_with=bind)
    schedule_entries = sa.Table("schedule_entries", metadata, autoload_with=bind)
    team_season_records = sa.Table("team_season_records", metadata, autoload_with=bind)

    now = dt.datetime.now(dt.timezone.utc)
    today = dt.date.today()
    current_start_year = _season_start_year_for_date(today)
    required_start_years = {current_start_year}
    if today.month == PRECREATE_NEXT_SEASON_MONTH:
        required_start_years.add(current_start_year + 1)

    bind.execute(sa.delete(team_season_records))

    season_rows = bind.execute(sa.select(seasons)).mappings().all()
    season_rows = sorted(
        season_rows,
        key=lambda row: (
            _infer_start_year(row["start_date"], row["end_date"]),
            0 if row["is_active"] else 1,
            str(row["created_at"] or ""),
            row["id"],
        ),
    )

    kept_seasons: dict[int, str] = {}
    placeholder_association_id = bind.execute(
        sa.select(associations.c.id).order_by(associations.c.id).limit(1)
    ).scalar()

    for row in season_rows:
        start_year = _infer_start_year(row["start_date"], row["end_date"])
        keeper_id = kept_seasons.get(start_year)
        if keeper_id is None:
            kept_seasons[start_year] = row["id"]
            continue

        bind.execute(sa.update(games).where(games.c.season_id == row["id"]).values(season_id=keeper_id))
        bind.execute(
            sa.update(schedule_entries)
            .where(schedule_entries.c.season_id == row["id"])
            .values(season_id=keeper_id)
        )
        bind.execute(sa.delete(seasons).where(seasons.c.id == row["id"]))

    remaining_rows = bind.execute(sa.select(seasons)).mappings().all()
    existing_start_years: set[int] = set()
    for row in remaining_rows:
        start_year = _infer_start_year(row["start_date"], row["end_date"])
        existing_start_years.add(start_year)
        start_date, end_date = _canonical_bounds(start_year)
        bind.execute(
            sa.update(seasons)
            .where(seasons.c.id == row["id"])
            .values(
                name=_canonical_name(start_year),
                start_date=start_date,
                end_date=end_date,
                is_active=start_year == current_start_year,
                updated_at=now,
            )
        )

    if placeholder_association_id:
        for start_year in sorted(required_start_years):
            if start_year in existing_start_years:
                continue
            start_date, end_date = _canonical_bounds(start_year)
            bind.execute(
                sa.insert(seasons).values(
                    id=str(uuid.uuid4()),
                    association_id=placeholder_association_id,
                    name=_canonical_name(start_year),
                    start_date=start_date,
                    end_date=end_date,
                    is_active=start_year == current_start_year,
                    created_at=now,
                    updated_at=now,
                )
            )

    with op.batch_alter_table("seasons") as batch_op:
        batch_op.drop_index("ix_seasons_assoc_active")
        batch_op.drop_constraint("uq_seasons_assoc_name", type_="unique")
        batch_op.drop_column("association_id")
        batch_op.create_unique_constraint("uq_seasons_name", ["name"])
        batch_op.create_index("ix_seasons_active", ["is_active"])


def downgrade() -> None:
    # This change intentionally collapses association-specific seasons into
    # global seasons and cannot be reversed safely.
    pass
