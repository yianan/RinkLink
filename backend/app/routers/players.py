from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, ensure_team_access
from ..database import get_db
from ..models import Player, Team, Season, Event, EventPlayerStat, EventGoalieStat
from ..schemas.player import (
    PlayerCreate,
    PlayerUpdate,
    PlayerOut,
    PlayerSeasonTotalsOut,
    PlayerUploadPreview,
    PlayerConfirmUpload,
)
from ..services.roster_csv_parser import parse_roster_csv

router = APIRouter(tags=["players"])


def _require_team_for_roster_access(db: Session, team_id: str, context: AuthorizationContext, capability: str) -> Team:
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, capability)
    return team


def _duplicate_player_query(
    db: Session,
    *,
    team_id: str,
    season_id: str,
    first_name: str,
    last_name: str,
    jersey_number: int | None,
    position: str | None,
):
    q = db.query(Player).filter(
        Player.team_id == team_id,
        Player.season_id == season_id,
        Player.first_name == first_name,
        Player.last_name == last_name,
    )
    q = (
        q.filter(Player.jersey_number == jersey_number)
        if jersey_number is not None
        else q.filter(Player.jersey_number.is_(None))
    )
    q = (
        q.filter(Player.position == position)
        if position is not None
        else q.filter(Player.position.is_(None))
    )
    return q


def _reject_duplicate_player(
    db: Session,
    *,
    team_id: str,
    season_id: str,
    first_name: str,
    last_name: str,
    jersey_number: int | None,
    position: str | None,
    exclude_player_id: str | None = None,
) -> None:
    q = _duplicate_player_query(
        db,
        team_id=team_id,
        season_id=season_id,
        first_name=first_name,
        last_name=last_name,
        jersey_number=jersey_number,
        position=position,
    )
    if exclude_player_id:
        q = q.filter(Player.id != exclude_player_id)
    if q.first():
        raise HTTPException(409, "This player already exists on the selected season roster")


def _player_out(player: Player) -> PlayerOut:
    return PlayerOut(
        id=player.id,
        team_id=player.team_id,
        season_id=player.season_id,
        first_name=player.first_name,
        last_name=player.last_name,
        jersey_number=player.jersey_number,
        position=player.position,
        season_totals=PlayerSeasonTotalsOut(),
        created_at=player.created_at,
        updated_at=player.updated_at,
    )


@router.get("/teams/{team_id}/players", response_model=list[PlayerOut])
def list_players(
    team_id: str,
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    _require_team_for_roster_access(db, team_id, context, "team.view_private")
    if season_id and not db.get(Season, season_id):
        raise HTTPException(404, "Season not found")
    q = db.query(Player).filter(Player.team_id == team_id)
    if season_id:
        q = q.filter(Player.season_id == season_id)
    q = q.order_by(Player.jersey_number.is_(None), Player.jersey_number, Player.last_name, Player.first_name)
    players = q.all()
    if not players:
        return []

    player_ids = [player.id for player in players]
    season_ids = {player.season_id for player in players}

    skater_totals: dict[str, dict[str, int]] = {
        player_id: {"goals": 0, "assists": 0, "shots_on_goal": 0}
        for player_id in player_ids
    }
    goalie_totals: dict[str, dict[str, int]] = {
        player_id: {"saves": 0, "shootout_shots": 0, "shootout_saves": 0}
        for player_id in player_ids
    }

    skater_rows = (
        db.query(
            EventPlayerStat.player_id.label("player_id"),
            func.coalesce(func.sum(EventPlayerStat.goals), 0).label("goals"),
            func.coalesce(func.sum(EventPlayerStat.assists), 0).label("assists"),
            func.coalesce(func.sum(EventPlayerStat.shots_on_goal), 0).label("shots_on_goal"),
        )
        .join(Event, Event.id == EventPlayerStat.event_id)
        .filter(
            EventPlayerStat.team_id == team_id,
            EventPlayerStat.player_id.in_(player_ids),
            Event.season_id.in_(season_ids),
            Event.status != "cancelled",
        )
        .group_by(EventPlayerStat.player_id)
        .all()
    )
    for row in skater_rows:
        skater_totals[row.player_id] = {
            "goals": int(row.goals or 0),
            "assists": int(row.assists or 0),
            "shots_on_goal": int(row.shots_on_goal or 0),
        }

    goalie_rows = (
        db.query(
            EventGoalieStat.player_id.label("player_id"),
            func.coalesce(func.sum(EventGoalieStat.saves), 0).label("saves"),
            func.coalesce(func.sum(EventGoalieStat.shootout_shots), 0).label("shootout_shots"),
            func.coalesce(func.sum(EventGoalieStat.shootout_saves), 0).label("shootout_saves"),
        )
        .join(Event, Event.id == EventGoalieStat.event_id)
        .filter(
            EventGoalieStat.team_id == team_id,
            EventGoalieStat.player_id.in_(player_ids),
            Event.season_id.in_(season_ids),
            Event.status != "cancelled",
        )
        .group_by(EventGoalieStat.player_id)
        .all()
    )
    for row in goalie_rows:
        goalie_totals[row.player_id] = {
            "saves": int(row.saves or 0),
            "shootout_shots": int(row.shootout_shots or 0),
            "shootout_saves": int(row.shootout_saves or 0),
        }

    return [
        PlayerOut(
            id=player.id,
            team_id=player.team_id,
            season_id=player.season_id,
            first_name=player.first_name,
            last_name=player.last_name,
            jersey_number=player.jersey_number,
            position=player.position,
            season_totals=PlayerSeasonTotalsOut(
                goals=skater_totals[player.id]["goals"],
                assists=skater_totals[player.id]["assists"],
                shots_on_goal=skater_totals[player.id]["shots_on_goal"],
                saves=goalie_totals[player.id]["saves"],
                shootout_shots=goalie_totals[player.id]["shootout_shots"],
                shootout_saves=goalie_totals[player.id]["shootout_saves"],
            ),
            created_at=player.created_at,
            updated_at=player.updated_at,
        )
        for player in players
    ]


@router.post("/teams/{team_id}/players", response_model=PlayerOut, status_code=201)
def create_player(
    team_id: str,
    body: PlayerCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    _require_team_for_roster_access(db, team_id, context, "team.manage_roster")
    if not db.get(Season, body.season_id):
        raise HTTPException(404, "Season not found")
    payload = body.model_dump()
    payload["first_name"] = payload["first_name"].strip()
    payload["last_name"] = payload["last_name"].strip()
    payload["position"] = payload["position"].strip() if payload["position"] else None
    _reject_duplicate_player(db, team_id=team_id, **payload)
    p = Player(team_id=team_id, **payload)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _player_out(p)


@router.put("/players/{id}", response_model=PlayerOut)
def update_player(
    id: str,
    body: PlayerUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    p = db.get(Player, id)
    if not p:
        raise HTTPException(404, "Player not found")
    if not p.team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, p.team, "team.manage_roster")
    data = body.model_dump(exclude_unset=True)
    if "first_name" in data and data["first_name"] is not None:
        data["first_name"] = data["first_name"].strip()
    if "last_name" in data and data["last_name"] is not None:
        data["last_name"] = data["last_name"].strip()
    if "position" in data:
        data["position"] = data["position"].strip() if data["position"] else None
    next_values = {
        "season_id": p.season_id,
        "first_name": data.get("first_name", p.first_name),
        "last_name": data.get("last_name", p.last_name),
        "jersey_number": data.get("jersey_number", p.jersey_number),
        "position": data.get("position", p.position),
    }
    _reject_duplicate_player(db, team_id=p.team_id, exclude_player_id=p.id, **next_values)
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _player_out(p)


@router.delete("/players/{id}", status_code=204)
def delete_player(
    id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    p = db.get(Player, id)
    if not p:
        raise HTTPException(404, "Player not found")
    if not p.team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, p.team, "team.manage_roster")
    db.delete(p)
    db.commit()


@router.post("/teams/{team_id}/players/upload", response_model=PlayerUploadPreview)
async def upload_roster(
    team_id: str,
    file: UploadFile = File(...),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    _require_team_for_roster_access(db, team_id, context, "team.manage_roster")
    content = (await file.read()).decode("utf-8-sig")
    return parse_roster_csv(content)


@router.post("/teams/{team_id}/players/confirm-upload", response_model=list[PlayerOut], status_code=201)
def confirm_roster_upload(
    team_id: str,
    body: PlayerConfirmUpload,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    _require_team_for_roster_access(db, team_id, context, "team.manage_roster")
    if not db.get(Season, body.season_id):
        raise HTTPException(404, "Season not found")

    if body.replace_existing:
        db.query(Player).filter(Player.team_id == team_id, Player.season_id == body.season_id).delete()
        db.commit()

    created: list[Player] = []
    for row in body.entries:
        p = Player(team_id=team_id, season_id=body.season_id, **row.model_dump())
        db.add(p)
        created.append(p)
    db.commit()
    for p in created:
        db.refresh(p)
    return created
