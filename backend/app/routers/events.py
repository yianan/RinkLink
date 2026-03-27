from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Arena, ArenaRink, AvailabilityWindow, Event, IceSlot, LockerRoom, Team
from ..schemas import EventCreate, EventOut, EventUpdate, WeeklyConfirmUpdate
from ..services.competitions import normalize_event_competition
from ..services.event_view import enrich_event
from ..services.records import is_recordable_event, recompute_team_records

router = APIRouter(tags=["events"])


def _validate_event_links(db: Session, event: Event) -> None:
    arena = db.get(Arena, event.arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    arena_rink = db.get(ArenaRink, event.arena_rink_id)
    if not arena_rink or arena_rink.arena_id != arena.id:
        raise HTTPException(400, "Arena rink does not belong to arena")
    if event.ice_slot_id:
        slot = db.get(IceSlot, event.ice_slot_id)
        if not slot or slot.arena_rink_id != arena_rink.id:
            raise HTTPException(400, "Ice slot does not belong to arena rink")
        if slot.date != event.date:
            raise HTTPException(400, "Ice slot date must match event date")
    for locker_room_id in (event.home_locker_room_id, event.away_locker_room_id):
        if not locker_room_id:
            continue
        locker_room = db.get(LockerRoom, locker_room_id)
        if not locker_room or locker_room.arena_rink_id != arena_rink.id:
            raise HTTPException(400, "Locker room does not belong to arena rink")
    if event.event_type in {"practice", "scrimmage"}:
        event.away_team_id = None
        event.away_availability_window_id = None
        event.away_locker_room_id = None
    elif not event.away_team_id:
        raise HTTPException(400, "Away team is required for non-practice events")


def _book_slot(db: Session, event: Event) -> None:
    if not event.ice_slot_id:
        return
    slot = db.get(IceSlot, event.ice_slot_id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    if slot.status not in {"available", "held"} and slot.booked_by_team_id != event.home_team_id:
        raise HTTPException(409, "Ice slot is not available")
    slot.status = "booked"
    slot.booked_by_team_id = event.home_team_id


def _release_slot(db: Session, event: Event) -> None:
    if not event.ice_slot_id:
        return
    _release_slot_by_id(db, event.ice_slot_id)


def _release_slot_by_id(db: Session, ice_slot_id: str | None) -> None:
    if not ice_slot_id:
        return
    slot = db.get(IceSlot, ice_slot_id)
    if slot:
        slot.status = "available"
        slot.booked_by_team_id = None


def _sync_availability_on_schedule(db: Session, event: Event) -> None:
    for window_id, opponent_team_id in (
        (event.home_availability_window_id, event.away_team_id),
        (event.away_availability_window_id, event.home_team_id),
    ):
        if not window_id:
            continue
        window = db.get(AvailabilityWindow, window_id)
        if not window:
            continue
        window.status = "scheduled" if event.status != "cancelled" else "open"
        window.opponent_team_id = opponent_team_id if event.status != "cancelled" else None


@router.get("/teams/{team_id}/events", response_model=list[EventOut])
def list_events(
    team_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    season_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    query = db.query(Event).filter((Event.home_team_id == team_id) | (Event.away_team_id == team_id))
    if status:
        query = query.filter(Event.status == status)
    if date_from:
        query = query.filter(Event.date >= date_from)
    if date_to:
        query = query.filter(Event.date <= date_to)
    if season_id:
        query = query.filter(Event.season_id == season_id)
    return [enrich_event(event, db) for event in query.order_by(Event.date, Event.start_time).all()]


@router.post("/teams/{team_id}/events", response_model=EventOut, status_code=201)
def create_event(team_id: str, body: EventCreate, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    if not body.ice_slot_id:
        raise HTTPException(400, "An ice slot is required to create an event")
    event = Event(home_team_id=team_id, status="scheduled", **body.model_dump())
    _validate_event_links(db, event)
    normalize_event_competition(event, db)
    _book_slot(db, event)
    db.add(event)
    db.flush()
    _sync_availability_on_schedule(db, event)
    db.commit()
    db.refresh(event)
    return enrich_event(event, db)


@router.get("/events/{event_id}", response_model=EventOut)
def get_event(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    return enrich_event(event, db)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: str, body: EventUpdate, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if {"home_score", "away_score"} & body.model_fields_set and event.date > date.today():
        raise HTTPException(400, "Scores cannot be recorded for future events")
    if {"home_score", "away_score"} & body.model_fields_set and (body.home_score is None or body.away_score is None):
        raise HTTPException(400, "Both home and away scores are required")
    previous_slot_id = event.ice_slot_id
    was_recordable = is_recordable_event(event)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    _validate_event_links(db, event)
    normalize_event_competition(event, db)
    if previous_slot_id != event.ice_slot_id:
        _release_slot_by_id(db, previous_slot_id)
        _book_slot(db, event)
    if body.home_score is not None and body.away_score is not None and "status" not in body.model_fields_set:
        event.status = "final"
    _sync_availability_on_schedule(db, event)
    db.flush()
    if was_recordable or is_recordable_event(event):
        recompute_team_records(db, event.home_team_id)
        if event.away_team_id:
            recompute_team_records(db, event.away_team_id)
    db.commit()
    db.refresh(event)
    return enrich_event(event, db)


@router.patch("/events/{event_id}/cancel", response_model=EventOut)
def cancel_event(event_id: str, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    was_recordable = is_recordable_event(event)
    event.status = "cancelled"
    event.home_weekly_confirmed = False
    event.away_weekly_confirmed = False
    _release_slot(db, event)
    _sync_availability_on_schedule(db, event)
    if was_recordable:
        recompute_team_records(db, event.home_team_id)
        if event.away_team_id:
            recompute_team_records(db, event.away_team_id)
    db.commit()
    db.refresh(event)
    return enrich_event(event, db)


@router.patch("/events/{event_id}/weekly-confirm", response_model=EventOut)
def weekly_confirm(event_id: str, body: WeeklyConfirmUpdate, db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if body.team_id not in {event.home_team_id, event.away_team_id}:
        raise HTTPException(400, "Team is not part of this event")
    if body.team_id == event.home_team_id:
        event.home_weekly_confirmed = body.confirmed
    else:
        event.away_weekly_confirmed = body.confirmed
    if event.away_team_id and event.home_weekly_confirmed and event.away_weekly_confirmed:
        event.status = "confirmed"
    elif event.status == "confirmed":
        event.status = "scheduled"
    db.commit()
    db.refresh(event)
    return enrich_event(event, db)
