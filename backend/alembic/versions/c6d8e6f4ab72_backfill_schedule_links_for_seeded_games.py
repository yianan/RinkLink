"""backfill schedule links for seeded games

Revision ID: c6d8e6f4ab72
Revises: 91d6a4a3d2c1
Create Date: 2026-03-10 16:55:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c6d8e6f4ab72"
down_revision: Union[str, Sequence[str], None] = "91d6a4a3d2c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _find_schedule_entry(bind, schedule_entries, team_id: str, game_date, game_time, entry_type: str):
    query = sa.select(schedule_entries).where(
        schedule_entries.c.team_id == team_id,
        schedule_entries.c.date == game_date,
        schedule_entries.c.entry_type == entry_type,
    )
    if game_time is None:
        query = query.where(schedule_entries.c.time.is_(None))
    else:
        query = query.where(schedule_entries.c.time == game_time)
    return bind.execute(
        query.order_by(schedule_entries.c.created_at.asc(), schedule_entries.c.id.asc()).limit(1)
    ).mappings().first()


def _schedule_status(game_status: str) -> str:
    return "confirmed" if game_status in {"confirmed", "final"} else "scheduled"


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    teams = sa.Table("teams", metadata, autoload_with=bind)
    games = sa.Table("games", metadata, autoload_with=bind)
    schedule_entries = sa.Table("schedule_entries", metadata, autoload_with=bind)

    team_name_map = {
        row["id"]: row["name"]
        for row in bind.execute(sa.select(teams.c.id, teams.c.name)).mappings().all()
    }

    game_rows = bind.execute(
        sa.select(games).where(games.c.status.in_(["scheduled", "confirmed", "final"]))
    ).mappings().all()

    for game in game_rows:
        home_entry = None
        away_entry = None
        if game["home_schedule_entry_id"]:
            home_entry = bind.execute(
                sa.select(schedule_entries).where(schedule_entries.c.id == game["home_schedule_entry_id"])
            ).mappings().first()
        if game["away_schedule_entry_id"]:
            away_entry = bind.execute(
                sa.select(schedule_entries).where(schedule_entries.c.id == game["away_schedule_entry_id"])
            ).mappings().first()

        if home_entry is None:
            home_entry = _find_schedule_entry(bind, schedule_entries, game["home_team_id"], game["date"], game["time"], "home")
        if away_entry is None:
            away_entry = _find_schedule_entry(bind, schedule_entries, game["away_team_id"], game["date"], game["time"], "away")

        game_updates: dict[str, object] = {}
        if home_entry and not game["home_schedule_entry_id"]:
            game_updates["home_schedule_entry_id"] = home_entry["id"]
        if away_entry and not game["away_schedule_entry_id"]:
            game_updates["away_schedule_entry_id"] = away_entry["id"]
        if game["status"] == "confirmed":
            if not game["home_weekly_confirmed"]:
                game_updates["home_weekly_confirmed"] = True
            if not game["away_weekly_confirmed"]:
                game_updates["away_weekly_confirmed"] = True

        if game_updates:
            bind.execute(sa.update(games).where(games.c.id == game["id"]).values(**game_updates))

        home_confirmed = game_updates.get("home_weekly_confirmed", game["home_weekly_confirmed"])
        away_confirmed = game_updates.get("away_weekly_confirmed", game["away_weekly_confirmed"])
        schedule_status = _schedule_status(game["status"])

        if home_entry:
            bind.execute(
                sa.update(schedule_entries)
                .where(schedule_entries.c.id == home_entry["id"])
                .values(
                    status=schedule_status,
                    opponent_team_id=game["away_team_id"],
                    opponent_name=team_name_map.get(game["away_team_id"]),
                    weekly_confirmed=home_confirmed,
                )
            )
        if away_entry:
            bind.execute(
                sa.update(schedule_entries)
                .where(schedule_entries.c.id == away_entry["id"])
                .values(
                    status=schedule_status,
                    opponent_team_id=game["home_team_id"],
                    opponent_name=team_name_map.get(game["home_team_id"]),
                    weekly_confirmed=away_confirmed,
                )
            )


def downgrade() -> None:
    pass
