from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

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


@router.get("/teams/{team_id}/players", response_model=list[PlayerOut])
def list_players(team_id: str, season_id: str | None = Query(None), db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
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
def create_player(team_id: str, body: PlayerCreate, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    if not db.get(Season, body.season_id):
        raise HTTPException(404, "Season not found")
    p = Player(team_id=team_id, **body.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/players/{id}", response_model=PlayerOut)
def update_player(id: str, body: PlayerUpdate, db: Session = Depends(get_db)):
    p = db.get(Player, id)
    if not p:
        raise HTTPException(404, "Player not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/players/{id}", status_code=204)
def delete_player(id: str, db: Session = Depends(get_db)):
    p = db.get(Player, id)
    if not p:
        raise HTTPException(404, "Player not found")
    db.delete(p)
    db.commit()


@router.post("/teams/{team_id}/players/upload", response_model=PlayerUploadPreview)
async def upload_roster(team_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    content = (await file.read()).decode("utf-8-sig")
    return parse_roster_csv(content)


@router.post("/teams/{team_id}/players/confirm-upload", response_model=list[PlayerOut], status_code=201)
def confirm_roster_upload(team_id: str, body: PlayerConfirmUpload, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
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
