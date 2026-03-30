from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, ensure_arena_access, ensure_team_access
from ..database import get_db
from ..models import Arena, ArenaRink, Association, Event, IceBookingRequest, IceSlot, LockerRoom, Team
from ..schemas import IceBookingRequestAccept, IceBookingRequestAction, IceBookingRequestCreate, IceBookingRequestOut
from ..services.arena_logos import arena_logo_url
from ..services.competitions import normalize_event_competition
from ..services.locker_rooms import assign_locker_rooms, notify_locker_room_update
from ..services.records import is_recordable_event, recompute_team_records
from ..services.team_logos import effective_team_logo_url

router = APIRouter(tags=["ice-booking-requests"])


def _location_label(arena: Arena | None, arena_rink: ArenaRink | None) -> str | None:
    if arena and arena_rink:
        return f"{arena.name} > {arena_rink.name}"
    if arena:
        return arena.name
    return arena_rink.name if arena_rink else None


def _request_out(request_row: IceBookingRequest, db: Session) -> IceBookingRequestOut:
    out = IceBookingRequestOut.model_validate(request_row)
    requester = request_row.requester_team
    requester_assoc = db.get(Association, requester.association_id) if requester else None
    away_team = request_row.away_team
    away_assoc = db.get(Association, away_team.association_id) if away_team else None
    arena = request_row.arena
    rink = request_row.arena_rink
    slot = request_row.ice_slot
    out.requester_team_name = requester.name if requester else None
    out.requester_team_logo_url = effective_team_logo_url(requester, requester_assoc)
    out.requester_association_name = requester_assoc.name if requester_assoc else None
    out.away_team_name = away_team.name if away_team else None
    out.away_team_logo_url = effective_team_logo_url(away_team, away_assoc)
    out.away_association_name = away_assoc.name if away_assoc else None
    out.arena_name = arena.name if arena else None
    out.arena_logo_url = arena_logo_url(arena.logo_path if arena else None)
    out.arena_rink_name = rink.name if rink else None
    out.home_locker_room_name = request_row.home_locker_room.name if request_row.home_locker_room else None
    out.away_locker_room_name = request_row.away_locker_room.name if request_row.away_locker_room else None
    out.ice_slot_date = slot.date if slot else None
    out.ice_slot_start_time = slot.start_time if slot else None
    out.ice_slot_end_time = slot.end_time if slot else None
    out.ice_slot_notes = slot.notes if slot else None
    out.event_status = request_row.event.status if request_row.event else None
    out.location_label = _location_label(arena, rink)
    return out


def _compose_arena_note(
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


def _validate_request_event_type(event_type: str, away_team_id: str | None) -> None:
    if event_type in {"practice", "scrimmage"}:
        return
    if not away_team_id:
        raise HTTPException(400, "Away team is required for non-practice events")


def _ensure_room_belongs(rink_id: str, locker_room_id: str | None, label: str, db: Session) -> None:
    if not locker_room_id:
        return
    room = db.get(LockerRoom, locker_room_id)
    if not room or room.arena_rink_id != rink_id:
        raise HTTPException(400, f"{label} locker room does not belong to arena rink")


def _release_slot(slot: IceSlot | None) -> None:
    if not slot:
        return
    slot.status = "available"
    slot.booked_by_team_id = None


@router.get("/teams/{team_id}/ice-booking-requests", response_model=list[IceBookingRequestOut])
def list_team_ice_booking_requests(
    team_id: str,
    status: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage_schedule")
    query = db.query(IceBookingRequest).filter(IceBookingRequest.requester_team_id == team_id)
    if status:
        query = query.filter(IceBookingRequest.status == status)
    requests = query.order_by(IceBookingRequest.created_at.desc()).all()
    return [_request_out(request_row, db) for request_row in requests]


@router.post("/teams/{team_id}/ice-booking-requests", response_model=IceBookingRequestOut, status_code=201)
def create_team_ice_booking_request(
    team_id: str,
    body: IceBookingRequestCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage_schedule")
    slot = db.get(IceSlot, body.ice_slot_id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    if slot.status != "available":
        raise HTTPException(409, "Ice slot is not open for requests")
    rink = db.get(ArenaRink, slot.arena_rink_id)
    arena = db.get(Arena, rink.arena_id) if rink else None
    if not rink or not arena:
        raise HTTPException(400, "Ice slot venue is not configured correctly")
    if body.away_team_id and not db.get(Team, body.away_team_id):
        raise HTTPException(404, "Away team not found")
    _validate_request_event_type(body.event_type, body.away_team_id)

    request_row = IceBookingRequest(
        requester_team_id=team_id,
        away_team_id=body.away_team_id,
        season_id=body.season_id,
        event_type=body.event_type,
        arena_id=arena.id,
        arena_rink_id=rink.id,
        ice_slot_id=slot.id,
        pricing_mode=slot.pricing_mode,
        price_amount_cents=slot.price_amount_cents,
        currency=slot.currency,
        message=body.message,
    )
    slot.status = "held"
    slot.booked_by_team_id = team_id
    db.add(request_row)
    db.commit()
    db.refresh(request_row)
    return _request_out(request_row, db)


@router.get("/arenas/{arena_id}/ice-booking-requests", response_model=list[IceBookingRequestOut])
def list_arena_ice_booking_requests(
    arena_id: str,
    status: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    if not db.get(Arena, arena_id):
        raise HTTPException(404, "Arena not found")
    ensure_arena_access(context, arena_id, "arena.manage_booking_requests")
    query = db.query(IceBookingRequest).filter(IceBookingRequest.arena_id == arena_id)
    if status:
        query = query.filter(IceBookingRequest.status == status)
    requests = query.order_by(IceBookingRequest.created_at.desc()).all()
    return [_request_out(request_row, db) for request_row in requests]


@router.patch("/arenas/{arena_id}/ice-booking-requests/{request_id}/accept", response_model=IceBookingRequestOut)
def accept_ice_booking_request(
    arena_id: str,
    request_id: str,
    body: IceBookingRequestAccept,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_arena_access(context, arena_id, "arena.manage_booking_requests")
    request_row = db.get(IceBookingRequest, request_id)
    if not request_row or request_row.arena_id != arena_id:
        raise HTTPException(404, "Ice booking request not found")
    if request_row.status != "requested":
        raise HTTPException(400, "Only requested slots can be accepted")
    slot = request_row.ice_slot
    rink = request_row.arena_rink
    if not slot or not rink:
        raise HTTPException(400, "The requested slot is no longer available")
    if slot.status != "held":
        raise HTTPException(409, "The slot is no longer in a requested state")
    arena = request_row.arena
    final_price_amount_cents = request_row.price_amount_cents
    final_currency = request_row.currency

    event = Event(
        event_type=request_row.event_type,
        status="scheduled",
        home_team_id=request_row.requester_team_id,
        away_team_id=request_row.away_team_id if request_row.event_type not in {"practice", "scrimmage"} else None,
        season_id=request_row.season_id,
        arena_id=request_row.arena_id,
        arena_rink_id=request_row.arena_rink_id,
        ice_slot_id=request_row.ice_slot_id,
        home_locker_room_id=body.home_locker_room_id,
        away_locker_room_id=body.away_locker_room_id if request_row.event_type not in {"practice", "scrimmage"} else None,
        date=slot.date,
        start_time=slot.start_time,
        end_time=slot.end_time,
        notes=request_row.message,
    )
    normalize_event_competition(event, db)
    db.add(event)
    db.flush()
    assign_locker_rooms(
        db,
        event=event,
        home_locker_room_id=body.home_locker_room_id,
        away_locker_room_id=body.away_locker_room_id,
    )

    slot.status = "booked"
    slot.booked_by_team_id = request_row.requester_team_id

    request_row.status = "accepted"
    request_row.event_id = event.id
    request_row.home_locker_room_id = event.home_locker_room_id
    request_row.away_locker_room_id = event.away_locker_room_id
    request_row.final_price_amount_cents = final_price_amount_cents
    request_row.final_currency = final_currency
    arena_note = _compose_arena_note(
        arena_rink_name=rink.name if rink else None,
        home_locker_room_name=request_row.home_locker_room.name if request_row.home_locker_room else None,
        away_locker_room_name=request_row.away_locker_room.name if request_row.away_locker_room else None,
        custom_note=body.response_message,
    )
    request_row.response_message = arena_note
    request_row.responded_at = datetime.now(timezone.utc)

    notify_locker_room_update(
        db,
        event=event,
        arena_name=arena.name if arena else None,
        arena_rink_name=rink.name if rink else None,
        home_locker_room_name=request_row.home_locker_room.name if request_row.home_locker_room else None,
        away_locker_room_name=request_row.away_locker_room.name if request_row.away_locker_room else None,
        note=arena_note,
    )

    db.commit()
    db.refresh(event)
    db.refresh(request_row)
    return _request_out(request_row, db)


@router.patch("/arenas/{arena_id}/ice-booking-requests/{request_id}/reject", response_model=IceBookingRequestOut)
def reject_ice_booking_request(
    arena_id: str,
    request_id: str,
    body: IceBookingRequestAction,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_arena_access(context, arena_id, "arena.manage_booking_requests")
    request_row = db.get(IceBookingRequest, request_id)
    if not request_row or request_row.arena_id != arena_id:
        raise HTTPException(404, "Ice booking request not found")
    if request_row.status != "requested":
        raise HTTPException(400, "Only requested slots can be rejected")
    _release_slot(request_row.ice_slot)
    request_row.status = "rejected"
    request_row.response_message = body.response_message
    request_row.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(request_row)
    return _request_out(request_row, db)


def _cancel_accepted_request(request_row: IceBookingRequest, response_message: str | None, db: Session) -> None:
    event = request_row.event
    if event and (event.date < date.today() or event.status == "final"):
        raise HTTPException(400, "Completed bookings cannot be cancelled")
    if event:
        was_recordable = is_recordable_event(event)
        event.status = "cancelled"
        event.home_weekly_confirmed = False
        event.away_weekly_confirmed = False
        if was_recordable:
            recompute_team_records(db, event.home_team_id)
            if event.away_team_id:
                recompute_team_records(db, event.away_team_id)
    _release_slot(request_row.ice_slot)
    request_row.status = "cancelled"
    request_row.response_message = response_message
    request_row.responded_at = datetime.now(timezone.utc)


@router.patch("/teams/{team_id}/ice-booking-requests/{request_id}/cancel", response_model=IceBookingRequestOut)
def cancel_team_ice_booking_request(
    team_id: str,
    request_id: str,
    body: IceBookingRequestAction,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage_schedule")
    request_row = db.get(IceBookingRequest, request_id)
    if not request_row or request_row.requester_team_id != team_id:
        raise HTTPException(404, "Ice booking request not found")
    if request_row.status == "cancelled":
        return _request_out(request_row, db)
    if request_row.status == "rejected":
        raise HTTPException(400, "Rejected requests cannot be cancelled")
    if request_row.status == "accepted":
        _cancel_accepted_request(request_row, body.response_message, db)
    else:
        _release_slot(request_row.ice_slot)
        request_row.status = "cancelled"
        request_row.response_message = body.response_message
        request_row.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(request_row)
    return _request_out(request_row, db)


@router.patch("/arenas/{arena_id}/ice-booking-requests/{request_id}/cancel", response_model=IceBookingRequestOut)
def cancel_arena_ice_booking_request(
    arena_id: str,
    request_id: str,
    body: IceBookingRequestAction,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_arena_access(context, arena_id, "arena.manage_booking_requests")
    request_row = db.get(IceBookingRequest, request_id)
    if not request_row or request_row.arena_id != arena_id:
        raise HTTPException(404, "Ice booking request not found")
    if request_row.status == "cancelled":
        return _request_out(request_row, db)
    if request_row.status == "rejected":
        raise HTTPException(400, "Rejected requests cannot be cancelled")
    if request_row.status == "accepted":
        _cancel_accepted_request(request_row, body.response_message, db)
    else:
        _release_slot(request_row.ice_slot)
        request_row.status = "cancelled"
        request_row.response_message = body.response_message
        request_row.responded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(request_row)
    return _request_out(request_row, db)
