from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.context import current_authorization_context
from ..database import get_db
from ..models import Association, Event, Season, Team
from ..schemas import PublicEventOut, PublicSeasonOut, PublicTeamOut, StandingsEntry
from ..services.competitions import memberships_for_teams
from ..services.event_view import enrich_event
from ..services.records import final_games_for_season_window
from ..services.season_utils import ensure_standard_seasons
from ..services.team_logos import effective_team_logo_url

router = APIRouter(tags=["public-browse"])

PUBLIC_EVENT_STATUSES = {"scheduled", "confirmed", "final"}


def _season_out(db: Session, season: Season) -> PublicSeasonOut:
    game_count = db.query(func.count(Event.id)).filter(Event.season_id == season.id).scalar() or 0
    return PublicSeasonOut(
        id=season.id,
        name=season.name,
        start_date=season.start_date,
        end_date=season.end_date,
        is_active=season.is_active,
        game_count=game_count,
    )


def _team_out(db: Session, team: Team) -> PublicTeamOut:
    association = db.get(Association, team.association_id)
    return PublicTeamOut(
        id=team.id,
        association_id=team.association_id,
        association_name=association.name if association else None,
        name=team.name,
        age_group=team.age_group,
        level=team.level,
        logo_url=effective_team_logo_url(team, association),
        wins=team.wins,
        losses=team.losses,
        ties=team.ties,
    )


def _event_out(event: Event, db: Session) -> PublicEventOut:
    enriched = enrich_event(event, db)
    return PublicEventOut(
        id=enriched.id,
        event_type=enriched.event_type,
        status=enriched.status,
        date=enriched.date,
        start_time=enriched.start_time,
        end_time=enriched.end_time,
        home_team_id=enriched.home_team_id,
        away_team_id=enriched.away_team_id,
        home_team_name=enriched.home_team_name,
        away_team_name=enriched.away_team_name,
        home_team_logo_url=enriched.home_team_logo_url,
        away_team_logo_url=enriched.away_team_logo_url,
        arena_name=enriched.arena_name,
        arena_rink_name=enriched.arena_rink_name,
        location_label=enriched.location_label,
        competition_name=enriched.competition_name,
        competition_short_name=enriched.competition_short_name,
        division_name=enriched.division_name,
    )


@router.get("/browse/seasons", response_model=list[PublicSeasonOut])
def list_public_seasons(
    _=Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    seasons = ensure_standard_seasons(db)
    return [_season_out(db, season) for season in seasons]


@router.get("/browse/teams", response_model=list[PublicTeamOut])
def list_public_teams(
    season_id: str | None = Query(None),
    limit: int = 500,
    offset: int = 0,
    _=Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    teams = db.query(Team).order_by(Team.name.asc()).offset(offset).limit(limit).all()
    if season_id:
        memberships = memberships_for_teams(db, [team.id for team in teams], season_id)
        teams = [team for team in teams if memberships.get(team.id)]
    return [_team_out(db, team) for team in teams]


@router.get("/browse/teams/{team_id}/events", response_model=list[PublicEventOut])
def list_public_team_events(
    team_id: str,
    date_from: date | None = None,
    date_to: date | None = None,
    season_id: str | None = Query(None),
    limit: int = 500,
    offset: int = 0,
    _=Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    query = db.query(Event).filter(
        (Event.home_team_id == team_id) | (Event.away_team_id == team_id),
        Event.status.in_(PUBLIC_EVENT_STATUSES),
    )
    if date_from:
        query = query.filter(Event.date >= date_from)
    if date_to:
        query = query.filter(Event.date <= date_to)
    if season_id:
        query = query.filter(Event.season_id == season_id)
    return [_event_out(event, db) for event in query.order_by(Event.date.asc(), Event.start_time.asc()).offset(offset).limit(limit).all()]


@router.get("/browse/seasons/{season_id}/standings", response_model=list[StandingsEntry])
def list_public_standings(
    season_id: str,
    association_id: str | None = Query(None),
    age_group: str | None = Query(None),
    level: str | None = Query(None),
    _=Depends(current_authorization_context),
    db: Session = Depends(get_db),
):
    ensure_standard_seasons(db)
    season = db.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    query = db.query(Team)
    if association_id:
        query = query.filter(Team.association_id == association_id)
    if age_group:
        query = query.filter(Team.age_group == age_group)
    if level:
        query = query.filter(Team.level == level)
    teams = query.all()
    team_ids = [team.id for team in teams]
    games = final_games_for_season_window(db, season, team_ids)

    all_team_ids = set(team_ids)
    for game in games:
        all_team_ids.add(game.home_team_id)
        if game.away_team_id:
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

    team_cache = {team.id: team for team in teams}
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
