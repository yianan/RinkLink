from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Game, Team, ScheduleEntry, TeamSeasonRecord
from ..models.rink import IceSlot
from ..schemas import GameOut, GameUpdate, WeeklyConfirmUpdate
from ..services.game_view import enrich_game


def _update_team_record(team_id: str, db: Session, season_id: str | None = None) -> None:
    """Recompute and store wins/losses/ties for a team from all final games.
    Also updates the per-season record if season_id is provided."""
    team = db.get(Team, team_id)
    if not team:
        return
    final_games = db.query(Game).filter(
        (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        Game.status == "final",
        Game.home_score.isnot(None),
        Game.away_score.isnot(None),
    ).all()
    wins = losses = ties = 0
    for g in final_games:
        my_score = g.home_score if g.home_team_id == team_id else g.away_score
        opp_score = g.away_score if g.home_team_id == team_id else g.home_score
        if my_score > opp_score:
            wins += 1
        elif my_score < opp_score:
            losses += 1
        else:
            ties += 1
    team.wins = wins
    team.losses = losses
    team.ties = ties

    # Update per-season record
    if season_id:
        season_games = [g for g in final_games if g.season_id == season_id]
        sw = sl = st = 0
        for g in season_games:
            my_score = g.home_score if g.home_team_id == team_id else g.away_score
            opp_score = g.away_score if g.home_team_id == team_id else g.home_score
            if my_score > opp_score:
                sw += 1
            elif my_score < opp_score:
                sl += 1
            else:
                st += 1
        rec = db.query(TeamSeasonRecord).filter(
            TeamSeasonRecord.team_id == team_id,
            TeamSeasonRecord.season_id == season_id,
        ).first()
        if rec:
            rec.wins = sw
            rec.losses = sl
            rec.ties = st
        else:
            db.add(TeamSeasonRecord(team_id=team_id, season_id=season_id, wins=sw, losses=sl, ties=st))

router = APIRouter(tags=["games"])


@router.get("/teams/{team_id}/games", response_model=list[GameOut])
def list_games(
    team_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    season_id: str | None = Query(None),
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
    if season_id:
        q = q.filter(Game.season_id == season_id)

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
    # Auto-finalize when both scores are provided and status wasn't explicitly set
    if body.home_score is not None and body.away_score is not None and "status" not in body.model_fields_set:
        g.status = "final"
    db.flush()
    if g.status == "final":
        _update_team_record(g.home_team_id, db, g.season_id)
        _update_team_record(g.away_team_id, db, g.season_id)
    db.commit()
    db.refresh(g)
    return enrich_game(g, db)


@router.patch("/games/{id}/cancel", response_model=GameOut)
def cancel_game(id: str, db: Session = Depends(get_db)):
    g = db.get(Game, id)
    if not g:
        raise HTTPException(404, "Game not found")
    g.status = "cancelled"
    g.home_weekly_confirmed = False
    g.away_weekly_confirmed = False
    for se_id in (g.home_schedule_entry_id, g.away_schedule_entry_id):
        if not se_id:
            continue
        se = db.get(ScheduleEntry, se_id)
        if not se:
            continue
        se.status = "open"
        se.opponent_team_id = None
        se.opponent_name = None
        se.weekly_confirmed = False
    if g.ice_slot_id:
        slot = db.get(IceSlot, g.ice_slot_id)
        if slot:
            slot.status = "available"
            slot.booked_by_team_id = None
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
