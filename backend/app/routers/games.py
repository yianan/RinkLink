from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Game, Team, ScheduleEntry
from ..schemas import GameOut, GameUpdate, WeeklyConfirmUpdate
from ..services.game_view import enrich_game

router = APIRouter(tags=["games"])


@router.get("/teams/{team_id}/games", response_model=list[GameOut])
def list_games(
    team_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")

    q = db.query(Game).filter((Game.home_team_id == team_id) | (Game.away_team_id == team_id))
    if status:
        q = q.filter(Game.status == status)
    if date_from:
        q = q.filter(Game.date >= date_from)
    if date_to:
        q = q.filter(Game.date <= date_to)

    games = q.order_by(Game.date, Game.time).all()
    return [enrich_game(g, db) for g in games]


@router.get("/games/{id}", response_model=GameOut)
def get_game(id: str, db: Session = Depends(get_db)):
    g = db.get(Game, id)
    if not g:
        raise HTTPException(404, "Game not found")
    return enrich_game(g, db)


@router.patch("/games/{id}", response_model=GameOut)
def update_game(id: str, body: GameUpdate, db: Session = Depends(get_db)):
    g = db.get(Game, id)
    if not g:
        raise HTTPException(404, "Game not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    db.commit()
    db.refresh(g)
    return enrich_game(g, db)


@router.patch("/games/{id}/weekly-confirm", response_model=GameOut)
def weekly_confirm(id: str, body: WeeklyConfirmUpdate, db: Session = Depends(get_db)):
    g = db.get(Game, id)
    if not g:
        raise HTTPException(404, "Game not found")

    if body.team_id not in (g.home_team_id, g.away_team_id):
        raise HTTPException(400, "Team is not part of this game")

    if body.team_id == g.home_team_id:
        g.home_weekly_confirmed = body.confirmed
        if g.home_schedule_entry_id:
            se = db.get(ScheduleEntry, g.home_schedule_entry_id)
            if se:
                se.weekly_confirmed = body.confirmed
    else:
        g.away_weekly_confirmed = body.confirmed
        if g.away_schedule_entry_id:
            se = db.get(ScheduleEntry, g.away_schedule_entry_id)
            if se:
                se.weekly_confirmed = body.confirmed

    both_confirmed = g.home_weekly_confirmed and g.away_weekly_confirmed
    g.status = "confirmed" if both_confirmed else "scheduled"

    # Keep schedule entries in sync so the schedule page reflects confirmation.
    for se_id in (g.home_schedule_entry_id, g.away_schedule_entry_id):
        if not se_id:
            continue
        se = db.get(ScheduleEntry, se_id)
        if not se:
            continue
        if both_confirmed:
            se.status = "confirmed"
        else:
            if se.status == "confirmed":
                se.status = "scheduled"

    db.commit()
    db.refresh(g)
    return enrich_game(g, db)
