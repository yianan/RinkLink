from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.context import (
    AuthorizationContext,
    authorization_context,
    can_access_arena,
    can_access_team,
    ensure_event_team_access,
    ensure_team_access,
)
from ..database import get_db
from ..models import Arena, ArenaRink, AvailabilityWindow, Event, IceBookingRequest, IceSlot, LockerRoom, Team
from ..schemas import (
    BulkEventAttendanceUpdate,
    EventAttendancePlayer,
    EventLockerRoomUpdate,
    EventOut,
    EventUpdate,
    WeeklyConfirmUpdate,
)
from ..services.attendance import (
    attach_attendance_summary,
    attendance_players_for_roster,
    build_attendance_players,
    team_roster_for_event,
    upsert_attendance_updates,
    validate_attendance_team,
)
from ..services.competitions import normalize_event_competition
from ..services.event_view import enrich_event
from ..services.locker_rooms import assign_locker_rooms, event_has_started, notify_locker_room_update
from ..services.records import is_recordable_event, recompute_team_records

router = APIRouter(tags=["events"])


def _compose_booking_response_message(
    *,
    arena_rink_name: str | None,
    home_locker_room_name: str | None,
    away_locker_room_name: str | None,
    custom_note: str | None,
) -> str | None:
    details: list[str] = []
    if arena_rink_name:
        details.append(f"Rink: {arena_rink_name}")
    if home_locker_room_name or away_locker_room_name:
        if away_locker_room_name:
            details.append(f"Locker rooms: {home_locker_room_name or 'TBD'} / {away_locker_room_name}")
        else:
            details.append(f"Locker room: {home_locker_room_name or 'TBD'}")
    if custom_note:
        details.append(custom_note)
    return "\n".join(details) if details else None


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
        if slot.start_time != event.start_time or slot.end_time != event.end_time:
            raise HTTPException(400, "Event time must match the selected ice slot")
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
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not can_access_team(context, team, "team.view", allow_linked_family=True):
        raise HTTPException(403, "You do not have access to this team")
    query = db.query(Event).filter((Event.home_team_id == team_id) | (Event.away_team_id == team_id))
    if status:
        query = query.filter(Event.status == status)
    if date_from:
        query = query.filter(Event.date >= date_from)
    if date_to:
        query = query.filter(Event.date <= date_to)
    if season_id:
        query = query.filter(Event.season_id == season_id)
    enriched_events: list[EventOut] = []
    for event in query.order_by(Event.date, Event.start_time).all():
        out = enrich_event(event, db)
        attach_attendance_summary(db, event, team_id, out)
        enriched_events.append(out)
    return enriched_events


@router.get("/arenas/{arena_id}/events", response_model=list[EventOut])
def list_arena_events(
    arena_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    if not db.get(Arena, arena_id):
        raise HTTPException(404, "Arena not found")
    if not can_access_arena(context, arena_id, "arena.view"):
        raise HTTPException(403, "You do not have access to this arena")
    query = db.query(Event).filter(Event.arena_id == arena_id)
    if status:
        query = query.filter(Event.status == status)
    if date_from:
        query = query.filter(Event.date >= date_from)
    if date_to:
        query = query.filter(Event.date <= date_to)
    return [enrich_event(event, db) for event in query.order_by(Event.date, Event.start_time).all()]

@router.get("/events/{event_id}", response_model=EventOut)
def get_event(
    event_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if not ensure_event_team_or_arena_read_access(context, event):
        raise HTTPException(403, "You do not have access to this event")
    return enrich_event(event, db)


@router.get("/teams/{team_id}/events/{event_id}/attendance", response_model=list[EventAttendancePlayer])
def get_event_attendance(
    team_id: str,
    event_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    validate_attendance_team(event, team_id)
    target_team = event.home_team if event.home_team_id == team_id else event.away_team
    if not target_team:
        raise HTTPException(404, "Team not found")
    if can_access_team(context, target_team, "team.view_private"):
        return build_attendance_players(db, event, team_id)

    if team_id not in context.linked_team_ids:
        raise HTTPException(403, "You do not have access to this team attendance")
    roster = [
        player
        for player in team_roster_for_event(db, event, team_id)
        if player.id in (context.guardian_player_ids | context.player_ids)
    ]
    if not roster:
        return []
    return attendance_players_for_roster(db, event, roster)


@router.put("/teams/{team_id}/events/{event_id}/attendance", response_model=list[EventAttendancePlayer])
def update_event_attendance(
    team_id: str,
    event_id: str,
    body: BulkEventAttendanceUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    validate_attendance_team(event, team_id)
    target_team = event.home_team if event.home_team_id == team_id else event.away_team
    if not target_team:
        raise HTTPException(404, "Team not found")
    updates = {item.player_id: item.status for item in body.updates}
    if can_access_team(context, target_team, "team.manage_attendance"):
        players = upsert_attendance_updates(db, event, team_id, updates)
        db.commit()
        return players

    if team_id not in context.linked_team_ids:
        raise HTTPException(403, "You do not have access to update attendance for this team")
    allowed_player_ids = context.guardian_player_ids | context.player_ids
    if not allowed_player_ids:
        raise HTTPException(403, "You do not have access to update attendance for this team")
    invalid_updates = set(updates) - allowed_player_ids
    if invalid_updates:
        raise HTTPException(403, "You can only update attendance for linked players")
    players = upsert_attendance_updates(db, event, team_id, updates)
    db.commit()
    return players


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(
    event_id: str,
    body: EventUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    ensure_event_team_access(context, event, "team.manage_schedule")
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
def cancel_event(
    event_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    ensure_event_team_access(context, event, "team.manage_schedule")
    was_recordable = is_recordable_event(event)
    event.status = "cancelled"
    event.home_weekly_confirmed = False
    event.away_weekly_confirmed = False
    _release_slot(db, event)
    _sync_availability_on_schedule(db, event)
    booking_request = db.query(IceBookingRequest).filter(IceBookingRequest.event_id == event.id).first()
    if booking_request and booking_request.status == "accepted":
        booking_request.status = "cancelled"
    if was_recordable:
        recompute_team_records(db, event.home_team_id)
        if event.away_team_id:
            recompute_team_records(db, event.away_team_id)
    db.commit()
    db.refresh(event)
    return enrich_event(event, db)


@router.patch("/events/{event_id}/locker-rooms", response_model=EventOut)
def update_event_locker_rooms(
    event_id: str,
    body: EventLockerRoomUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if not (
        can_access_arena(context, event.arena_id, "arena.manage_booking_requests")
        or ensure_event_team_or_arena_schedule_access(context, event)
    ):
        raise HTTPException(403, "You do not have access to update locker rooms for this event")
    if event.status == "cancelled":
        raise HTTPException(400, "Locker rooms cannot be changed for cancelled events")
    if event_has_started(event):
        raise HTTPException(400, "Locker rooms can only be changed before the event starts")
    assign_locker_rooms(
        db,
        event=event,
        home_locker_room_id=body.home_locker_room_id,
        away_locker_room_id=body.away_locker_room_id,
    )
    booking_request = db.query(IceBookingRequest).filter(IceBookingRequest.event_id == event.id).first()
    if booking_request:
        booking_request.home_locker_room_id = event.home_locker_room_id
        booking_request.away_locker_room_id = event.away_locker_room_id
        booking_request.response_message = _compose_booking_response_message(
            arena_rink_name=event.arena_rink.name if event.arena_rink else None,
            home_locker_room_name=event.home_locker_room.name if event.home_locker_room else None,
            away_locker_room_name=event.away_locker_room.name if event.away_locker_room else None,
            custom_note=body.response_message,
        )
    notify_locker_room_update(
        db,
        event=event,
        arena_name=event.arena.name if event.arena else None,
        arena_rink_name=event.arena_rink.name if event.arena_rink else None,
        home_locker_room_name=event.home_locker_room.name if event.home_locker_room else None,
        away_locker_room_name=event.away_locker_room.name if event.away_locker_room else None,
        note=body.response_message,
    )
    db.commit()
    db.refresh(event)
    return enrich_event(event, db)


@router.patch("/events/{event_id}/weekly-confirm", response_model=EventOut)
def weekly_confirm(
    event_id: str,
    body: WeeklyConfirmUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if body.team_id not in {event.home_team_id, event.away_team_id}:
        raise HTTPException(400, "Team is not part of this event")
    target_team = event.home_team if event.home_team_id == body.team_id else event.away_team
    if not target_team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, target_team, "team.manage_schedule")
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


def ensure_event_team_or_arena_read_access(context: AuthorizationContext, event: Event) -> bool:
    return any(
        team is not None and can_access_team(context, team, "team.view", allow_linked_family=True)
        for team in (event.home_team, event.away_team)
    ) or can_access_arena(context, event.arena_id, "arena.view")


def ensure_event_team_or_arena_schedule_access(context: AuthorizationContext, event: Event) -> bool:
    return (
        (event.home_team is not None and can_access_team(context, event.home_team, "team.manage_schedule"))
        or (event.away_team is not None and can_access_team(context, event.away_team, "team.manage_schedule"))
    )
