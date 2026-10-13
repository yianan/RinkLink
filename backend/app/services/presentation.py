from types import SimpleNamespace
from ..models import Arena, ArenaRink, Team


def row_out(row):
    return {column.key: getattr(row, column.key) for column in row.__table__.columns}


def enrich(row, db):
    data = row_out(row)
    home, away = db.get(Team, row.home_team_id), db.get(Team, row.away_team_id) if row.away_team_id else None
    arena, rink = db.get(Arena, row.arena_id), db.get(ArenaRink, row.arena_rink_id)
    data.update(home_team_name=home.name, away_team_name=away.name if away else getattr(row, "opponent_name", None),
        arena_name=arena.name, arena_rink_name=rink.name, location_label=f"{arena.name} > {rink.name}")
    return data


def enrich_event(event, db):
    return SimpleNamespace(**enrich(event, db))
