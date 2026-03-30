from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context
from ..database import get_db
from ..models import Association, Event, Season, Team
from ..schemas.season import SeasonOut, StandingsEntry
from ..services.records import final_games_for_season_window
from ..services.season_utils import ensure_standard_seasons
from ..services.team_logos import effective_team_logo_url


def _season_with_game_count(db: Session, season: Season) -> dict:
    count = db.query(func.count(Event.id)).filter(Event.season_id == season.id).scalar() or 0
    data = {c.key: getattr(season, c.key) for c in season.__table__.columns}
    data["game_count"] = count
    return data


router = APIRouter(tags=["seasons"])


@router.get("/seasons", response_model=list[SeasonOut])
def list_seasons(_: AuthorizationContext = Depends(authorization_context), db: Session = Depends(get_db)):
    seasons = ensure_standard_seasons(db)
    return [_season_with_game_count(db, season) for season in seasons]


@router.get("/seasons/{id}", response_model=SeasonOut)
def get_season(id: str, _: AuthorizationContext = Depends(authorization_context), db: Session = Depends(get_db)):
    ensure_standard_seasons(db)
    season = db.get(Season, id)
    if not season:
        raise HTTPException(404, "Season not found")
    return _season_with_game_count(db, season)


@router.get("/seasons/{id}/standings", response_model=list[StandingsEntry])
def get_standings(
    id: str,
    association_id: str | None = Query(None),
    age_group: str | None = Query(None),
    level: str | None = Query(None),
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_standard_seasons(db)
    season = db.get(Season, id)
    if not season:
        raise HTTPException(404, "Season not found")

    q = db.query(Team)
    if association_id:
        q = q.filter(Team.association_id == association_id)
    if age_group:
        q = q.filter(Team.age_group == age_group)
    if level:
        q = q.filter(Team.level == level)
    teams = q.all()
    team_ids = [team.id for team in teams]
    games = final_games_for_season_window(db, season, team_ids)

    all_team_ids = set(team_ids)
    for game in games:
        all_team_ids.add(game.home_team_id)
        all_team_ids.add(game.away_team_id)

    records = {team_id: {"wins": 0, "losses": 0, "ties": 0} for team_id in all_team_ids}

    for game in games:
        if game.home_score > game.away_score:
            records[game.home_team_id]["wins"] += 1
            records[game.away_team_id]["losses"] += 1
        elif game.home_score < game.away_score:
            records[game.home_team_id]["losses"] += 1
            records[game.away_team_id]["wins"] += 1
        else:
            records[game.home_team_id]["ties"] += 1
            records[game.away_team_id]["ties"] += 1

    team_cache: dict[str, Team] = {team.id: team for team in teams}
    entries: list[StandingsEntry] = []
    for team_id, record in records.items():
        team = team_cache.get(team_id) or db.get(Team, team_id)
        if not team:
            continue
        if association_id and team.association_id != association_id:
            continue
        if age_group and team.age_group != age_group:
            continue
        if level and team.level != level:
            continue
        association = db.get(Association, team.association_id)
        games_played = record["wins"] + record["losses"] + record["ties"]
        entries.append(
            StandingsEntry(
                team_id=team_id,
                team_name=team.name,
                logo_url=effective_team_logo_url(team, association),
                association_name=association.name if association else None,
                age_group=team.age_group,
                level=team.level,
                wins=record["wins"],
                losses=record["losses"],
                ties=record["ties"],
                points=2 * record["wins"] + record["ties"],
                games_played=games_played,
            )
        )

    entries.sort(key=lambda entry: (-entry.points, -entry.wins, entry.team_name))
    return entries
