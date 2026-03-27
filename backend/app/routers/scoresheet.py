from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Event,
    Team,
    Player,
    EventPlayerStat,
    EventPenalty,
    EventGoalieStat,
    EventSignature,
)
from ..schemas.scoresheet import (
    EventScoresheetOut,
    UpsertPlayerStats,
    EventPenaltyCreate,
    UpsertGoalieStats,
    EventSignatureCreate,
    EventPlayerStatOut,
    EventPenaltyOut,
    EventGoalieStatOut,
    EventSignatureOut,
)
from ..services.event_view import enrich_event

router = APIRouter(tags=["scoresheet"])


def _require_team_in_event(team_id: str, event: Event):
    if team_id not in (event.home_team_id, event.away_team_id):
        raise HTTPException(400, "Team is not part of this event")


def _require_player_on_team(player_id: str, team_id: str, event: Event, db: Session):
    player = db.get(Player, player_id)
    if not player:
        raise HTTPException(400, "Player not found")
    if player.team_id != team_id:
        raise HTTPException(400, "Player does not belong to team")
    if event.season_id and player.season_id != event.season_id:
        raise HTTPException(400, "Player is not on this team's roster for the event's season")


@router.get("/events/{event_id}/scoresheet", response_model=EventScoresheetOut)
def get_scoresheet(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")

    return EventScoresheetOut(
        event=enrich_event(event, db),
        player_stats=db.query(EventPlayerStat).filter(EventPlayerStat.event_id == event_id).all(),
        penalties=db.query(EventPenalty).filter(EventPenalty.event_id == event_id).all(),
        goalie_stats=db.query(EventGoalieStat).filter(EventGoalieStat.event_id == event_id).all(),
        signatures=db.query(EventSignature).filter(EventSignature.event_id == event_id).all(),
    )


@router.put("/events/{event_id}/player-stats", response_model=list[EventPlayerStatOut])
def upsert_player_stats(event_id: str, body: UpsertPlayerStats, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")

    for stat in body.stats:
        _require_team_in_event(stat.team_id, event)
        _require_player_on_team(stat.player_id, stat.team_id, event, db)

        existing = (
            db.query(EventPlayerStat)
            .filter(EventPlayerStat.event_id == event_id, EventPlayerStat.player_id == stat.player_id)
            .first()
        )
        if existing:
            existing.team_id = stat.team_id
            existing.goals = stat.goals
            existing.assists = stat.assists
            existing.shots_on_goal = stat.shots_on_goal
        else:
            db.add(EventPlayerStat(
                event_id=event_id,
                team_id=stat.team_id,
                player_id=stat.player_id,
                goals=stat.goals,
                assists=stat.assists,
                shots_on_goal=stat.shots_on_goal,
            ))

    db.commit()
    return db.query(EventPlayerStat).filter(EventPlayerStat.event_id == event_id).all()


@router.get("/events/{event_id}/penalties", response_model=list[EventPenaltyOut])
def list_penalties(event_id: str, db: Session = Depends(get_db)):
    if not db.get(Event, event_id):
        raise HTTPException(404, "Event not found")
    return db.query(EventPenalty).filter(EventPenalty.event_id == event_id).order_by(EventPenalty.created_at).all()


@router.post("/events/{event_id}/penalties", response_model=EventPenaltyOut, status_code=201)
def create_penalty(event_id: str, body: EventPenaltyCreate, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    _require_team_in_event(body.team_id, event)
    if body.player_id:
        _require_player_on_team(body.player_id, body.team_id, event, db)

    penalty = EventPenalty(
        event_id=event_id,
        team_id=body.team_id,
        player_id=body.player_id,
        penalty_type=body.penalty_type,
        minutes=body.minutes,
    )
    db.add(penalty)
    db.commit()
    db.refresh(penalty)
    return penalty


@router.delete("/event-penalties/{id}", status_code=204)
def delete_penalty(id: str, db: Session = Depends(get_db)):
    penalty = db.get(EventPenalty, id)
    if not penalty:
        raise HTTPException(404, "Penalty not found")
    db.delete(penalty)
    db.commit()


@router.put("/events/{event_id}/goalie-stats", response_model=list[EventGoalieStatOut])
def upsert_goalie_stats(event_id: str, body: UpsertGoalieStats, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")

    for stat in body.stats:
        _require_team_in_event(stat.team_id, event)
        _require_player_on_team(stat.player_id, stat.team_id, event, db)

        existing = (
            db.query(EventGoalieStat)
            .filter(EventGoalieStat.event_id == event_id, EventGoalieStat.player_id == stat.player_id)
            .first()
        )
        if existing:
            existing.team_id = stat.team_id
            existing.saves = stat.saves
            existing.shootout_shots = stat.shootout_shots
            existing.shootout_saves = stat.shootout_saves
        else:
            db.add(EventGoalieStat(
                event_id=event_id,
                team_id=stat.team_id,
                player_id=stat.player_id,
                saves=stat.saves,
                shootout_shots=stat.shootout_shots,
                shootout_saves=stat.shootout_saves,
            ))

    db.commit()
    return db.query(EventGoalieStat).filter(EventGoalieStat.event_id == event_id).all()


@router.get("/events/{event_id}/signatures", response_model=list[EventSignatureOut])
def list_signatures(event_id: str, db: Session = Depends(get_db)):
    if not db.get(Event, event_id):
        raise HTTPException(404, "Event not found")
    return db.query(EventSignature).filter(EventSignature.event_id == event_id).order_by(EventSignature.created_at).all()


@router.post("/events/{event_id}/signatures", response_model=EventSignatureOut, status_code=201)
def sign(event_id: str, body: EventSignatureCreate, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")

    if body.team_id:
        _require_team_in_event(body.team_id, event)

    existing = (
        db.query(EventSignature)
        .filter(EventSignature.event_id == event_id, EventSignature.role == body.role)
        .first()
    )
    if existing:
        existing.signer_name = body.signer_name
        from datetime import datetime, timezone

        existing.signed_at = datetime.now(timezone.utc)
        existing.team_id = body.team_id
        db.commit()
        db.refresh(existing)
        return existing

    signature = EventSignature(event_id=event_id, role=body.role, signer_name=body.signer_name, team_id=body.team_id)
    db.add(signature)
    db.commit()
    db.refresh(signature)
    return signature
