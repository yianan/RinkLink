from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Player, Team, Season
from ..schemas.player import (
    PlayerCreate,
    PlayerUpdate,
    PlayerOut,
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
    return q.all()


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
