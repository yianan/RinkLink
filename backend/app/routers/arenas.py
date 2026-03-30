from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..auth.context import (
    AuthorizationContext,
    authorization_context,
    ensure_arena_access,
    ensure_capability,
)
from ..database import get_db
from ..models import Arena, ArenaRink, Event, IceBookingRequest, IceSlot, LockerRoom, Proposal, TeamSeasonVenueAssignment
from ..schemas import (
    ArenaCreate,
    ArenaOut,
    ArenaRinkCreate,
    ArenaRinkOut,
    ArenaRinkUpdate,
    ArenaUpdate,
    EventLockerRoomUpdate,
    IceSlotConfirmUpload,
    IceSlotCancel,
    IceSlotCreate,
    IceSlotOut,
    IceSlotUpdate,
    IceSlotUploadPreview,
    LockerRoomCreate,
    LockerRoomOut,
    LockerRoomUpdate,
    TeamSeasonVenueAssignmentOut,
)
from ..services.arena_logos import (
    arena_logo_file_path,
    arena_logo_url,
    delete_arena_logo_if_unused,
    save_arena_logo_upload,
)
from ..services.ice_slot_csv_parser import parse_ice_slot_csv
from ..services.locker_rooms import assign_locker_rooms, event_has_started, notify_locker_room_update
from ..services.proposal_lifecycle import cancel_proposal_record
from ..services.records import is_recordable_event, recompute_team_records

router = APIRouter(tags=["arenas"])


def _validate_time_range(start_time, end_time) -> None:
    if start_time is not None and end_time is not None and end_time < start_time:
        raise HTTPException(400, "End time must be the same as or later than start time")


def _validate_slot_pricing(pricing_mode: str, price_amount_cents: int | None) -> None:
    if pricing_mode == "fixed_price" and price_amount_cents is None:
        raise HTTPException(400, "Fixed-price slots require a price")


def _set_slot_available(slot: IceSlot | None) -> None:
    if not slot:
        return
    slot.status = "available"
    slot.booked_by_team_id = None


def _set_slot_cancelled(slot: IceSlot | None) -> None:
    if not slot:
        return
    slot.status = "cancelled"
    slot.booked_by_team_id = None


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


def _reopen_event_windows(event: Event, db: Session) -> None:
    from ..models import AvailabilityWindow

    for window_id in (event.home_availability_window_id, event.away_availability_window_id):
        if not window_id:
            continue
        window = db.get(AvailabilityWindow, window_id)
        if window:
            window.status = "open"
            window.opponent_team_id = None


def _slot_reference_conflict_detail(db: Session, ice_slot_id: str) -> str | None:
    event_count = db.query(Event).filter(Event.ice_slot_id == ice_slot_id).count()
    proposal_count = db.query(Proposal).filter(Proposal.ice_slot_id == ice_slot_id, Proposal.status == "proposed").count()
    booking_request_count = db.query(IceBookingRequest).filter(IceBookingRequest.ice_slot_id == ice_slot_id, IceBookingRequest.status.in_(("requested", "accepted"))).count()
    if event_count:
        return "This ice slot is already tied to a scheduled event. Remove or move the event first."
    if proposal_count:
        return "This ice slot is reserved for a game proposal. Remove or change the proposal first."
    if booking_request_count:
        return "This ice slot is tied to an ice booking request. Resolve the request first."
    return None


def _require_arena(db: Session, arena_id: str) -> Arena:
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    return arena


def _require_arena_rink(db: Session, arena_rink_id: str) -> ArenaRink:
    arena_rink = db.get(ArenaRink, arena_rink_id)
    if not arena_rink:
        raise HTTPException(404, "Arena rink not found")
    return arena_rink


def _require_locker_room(db: Session, locker_room_id: str) -> LockerRoom:
    locker_room = db.get(LockerRoom, locker_room_id)
    if not locker_room:
        raise HTTPException(404, "Locker room not found")
    return locker_room


def _require_ice_slot(db: Session, ice_slot_id: str) -> IceSlot:
    slot = db.get(IceSlot, ice_slot_id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    return slot


def _arena_id_for_rink(arena_rink: ArenaRink) -> str:
    return arena_rink.arena_id


def _arena_id_for_locker_room(db: Session, locker_room: LockerRoom) -> str:
    arena_rink = db.get(ArenaRink, locker_room.arena_rink_id)
    if not arena_rink:
        raise HTTPException(404, "Arena rink not found")
    return arena_rink.arena_id


def _arena_id_for_slot(db: Session, slot: IceSlot) -> str:
    arena_rink = db.get(ArenaRink, slot.arena_rink_id)
    if not arena_rink:
        raise HTTPException(404, "Arena rink not found")
    return arena_rink.arena_id


def _arena_out(arena: Arena, db: Session) -> ArenaOut:
    out = ArenaOut.model_validate(arena)
    out.logo_url = arena_logo_url(arena.logo_path)
    out.rink_count = db.query(ArenaRink).filter(ArenaRink.arena_id == arena.id).count()
    return out


@router.get("/arena-logos/{filename}", include_in_schema=False)
def get_arena_logo(filename: str):
    return FileResponse(arena_logo_file_path(filename))


def _arena_rink_out(arena_rink: ArenaRink, db: Session) -> ArenaRinkOut:
    arena = db.get(Arena, arena_rink.arena_id)
    out = ArenaRinkOut.model_validate(arena_rink)
    out.arena_name = arena.name if arena else None
    out.locker_room_count = db.query(LockerRoom).filter(LockerRoom.arena_rink_id == arena_rink.id).count()
    out.ice_slot_count = db.query(IceSlot).filter(IceSlot.arena_rink_id == arena_rink.id, IceSlot.status != "cancelled").count()
    return out


def _locker_room_out(locker_room: LockerRoom, db: Session) -> LockerRoomOut:
    arena_rink = db.get(ArenaRink, locker_room.arena_rink_id)
    arena = db.get(Arena, arena_rink.arena_id) if arena_rink else None
    out = LockerRoomOut.model_validate(locker_room)
    out.arena_rink_name = arena_rink.name if arena_rink else None
    out.arena_id = arena.id if arena else None
    out.arena_name = arena.name if arena else None
    return out


def _slot_out(slot: IceSlot, db: Session) -> IceSlotOut:
    arena_rink = db.get(ArenaRink, slot.arena_rink_id)
    arena = db.get(Arena, arena_rink.arena_id) if arena_rink else None
    booked_event = (
        db.query(Event)
        .filter(Event.ice_slot_id == slot.id)
        .order_by(Event.updated_at.desc())
        .first()
    )
    active_request = (
        db.query(IceBookingRequest)
        .filter(IceBookingRequest.ice_slot_id == slot.id, IceBookingRequest.status.in_(("requested", "accepted")))
        .order_by(IceBookingRequest.updated_at.desc())
        .first()
    )
    active_proposal = (
        db.query(Proposal)
        .filter(Proposal.ice_slot_id == slot.id, Proposal.status == "proposed")
        .order_by(Proposal.updated_at.desc())
        .first()
    )
    out = IceSlotOut.model_validate(slot)
    out.arena_rink_name = arena_rink.name if arena_rink else None
    out.arena_id = arena.id if arena else None
    out.arena_name = arena.name if arena else None
    out.booked_by_team_name = slot.booked_by_team.name if slot.booked_by_team else None
    out.booked_event_id = booked_event.id if booked_event else None
    out.booked_event_type = booked_event.event_type if booked_event else None
    out.booked_event_home_team_name = booked_event.home_team.name if booked_event and booked_event.home_team else None
    out.booked_event_away_team_name = booked_event.away_team.name if booked_event and booked_event.away_team else None
    out.active_booking_request_id = active_request.id if active_request else None
    out.active_booking_request_status = active_request.status if active_request else None
    out.active_booking_request_team_name = active_request.requester_team.name if active_request and active_request.requester_team else None
    out.active_booking_request_event_type = active_request.event_type if active_request else None
    out.active_proposal_id = active_proposal.id if active_proposal else None
    out.active_proposal_status = active_proposal.status if active_proposal else None
    out.active_proposal_home_team_name = active_proposal.home_team.name if active_proposal and active_proposal.home_team else None
    out.active_proposal_away_team_name = active_proposal.away_team.name if active_proposal and active_proposal.away_team else None
    return out


def _venue_assignment_out(assignment: TeamSeasonVenueAssignment, db: Session) -> TeamSeasonVenueAssignmentOut:
    out = TeamSeasonVenueAssignmentOut.model_validate(assignment)
    out.team_name = assignment.team.name if assignment.team else None
    out.arena_name = assignment.arena.name if assignment.arena else None
    out.arena_rink_name = assignment.arena_rink.name if assignment.arena_rink else None
    out.default_locker_room_name = assignment.default_locker_room.name if assignment.default_locker_room else None
    return out


@router.get("/arenas", response_model=list[ArenaOut])
def list_arenas(
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    return [_arena_out(arena, db) for arena in db.query(Arena).order_by(Arena.name).all()]


@router.post("/arenas", response_model=ArenaOut, status_code=201)
def create_arena(
    body: ArenaCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "platform.manage")
    arena = Arena(**body.model_dump())
    db.add(arena)
    db.commit()
    db.refresh(arena)
    return _arena_out(arena, db)


@router.get("/arenas/{arena_id}", response_model=ArenaOut)
def get_arena(
    arena_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    arena = _require_arena(db, arena_id)
    return _arena_out(arena, db)


@router.put("/arenas/{arena_id}", response_model=ArenaOut)
def update_arena(
    arena_id: str,
    body: ArenaUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena = _require_arena(db, arena_id)
    ensure_arena_access(context, arena_id, "arena.manage")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(arena, key, value)
    db.commit()
    db.refresh(arena)
    return _arena_out(arena, db)


@router.post("/arenas/{arena_id}/logo", response_model=ArenaOut)
async def upload_arena_logo(
    arena_id: str,
    file: UploadFile = File(...),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena = _require_arena(db, arena_id)
    ensure_arena_access(context, arena_id, "arena.manage")
    previous_logo_path = arena.logo_path
    arena.logo_path = await save_arena_logo_upload(arena_id, file)
    db.commit()
    db.refresh(arena)
    delete_arena_logo_if_unused(db, previous_logo_path, ignore_arena_id=arena.id)
    return _arena_out(arena, db)


@router.delete("/arenas/{arena_id}/logo", response_model=ArenaOut)
def delete_arena_logo(
    arena_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena = _require_arena(db, arena_id)
    ensure_arena_access(context, arena_id, "arena.manage")
    previous_logo_path = arena.logo_path
    arena.logo_path = None
    db.commit()
    db.refresh(arena)
    delete_arena_logo_if_unused(db, previous_logo_path, ignore_arena_id=arena.id)
    return _arena_out(arena, db)


@router.delete("/arenas/{arena_id}", status_code=204)
def delete_arena(
    arena_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "platform.manage")
    arena = _require_arena(db, arena_id)
    today = date.today()
    future_event_count = db.query(Event).filter(Event.arena_id == arena_id, Event.date >= today).count()
    historical_event_count = db.query(Event).filter(Event.arena_id == arena_id, Event.date < today).count()
    proposal_count = db.query(Proposal).filter(Proposal.arena_id == arena_id).count()
    booking_request_count = db.query(IceBookingRequest).filter(IceBookingRequest.arena_id == arena_id).count()
    assignment_count = db.query(TeamSeasonVenueAssignment).filter(TeamSeasonVenueAssignment.arena_id == arena_id).count()
    if future_event_count or historical_event_count or proposal_count or booking_request_count or assignment_count:
        parts: list[str] = []
        if future_event_count:
            parts.append(f"{future_event_count} upcoming event{'s' if future_event_count != 1 else ''}")
        if historical_event_count:
            parts.append(f"{historical_event_count} past event{'s' if historical_event_count != 1 else ''}")
        if proposal_count:
            parts.append(f"{proposal_count} proposal{'s' if proposal_count != 1 else ''}")
        if booking_request_count:
            parts.append(f"{booking_request_count} ice booking request{'s' if booking_request_count != 1 else ''}")
        if assignment_count:
            parts.append(f"{assignment_count} team venue assignment{'s' if assignment_count != 1 else ''}")
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete arena while it is referenced by {', '.join(parts)}. Reassign or remove those records first.",
        )
    db.delete(arena)
    db.commit()


@router.get("/arenas/{arena_id}/rinks", response_model=list[ArenaRinkOut])
def list_arena_rinks(
    arena_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    _require_arena(db, arena_id)
    rinks = (
        db.query(ArenaRink)
        .filter(ArenaRink.arena_id == arena_id)
        .order_by(ArenaRink.display_order, ArenaRink.name)
        .all()
    )
    return [_arena_rink_out(rink, db) for rink in rinks]


@router.get("/arenas/{arena_id}/ice-slots", response_model=list[IceSlotOut])
def list_arena_ice_slots(
    arena_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    _require_arena(db, arena_id)
    query = (
        db.query(IceSlot)
        .join(ArenaRink, ArenaRink.id == IceSlot.arena_rink_id)
        .filter(ArenaRink.arena_id == arena_id)
    )
    if status:
        query = query.filter(IceSlot.status == status)
    else:
        query = query.filter(IceSlot.status != "cancelled")
    if date_from:
        query = query.filter(IceSlot.date >= date_from)
    if date_to:
        query = query.filter(IceSlot.date <= date_to)
    slots = query.order_by(IceSlot.date, IceSlot.start_time, IceSlot.created_at).all()
    return [_slot_out(slot, db) for slot in slots]


@router.post("/arenas/{arena_id}/rinks", response_model=ArenaRinkOut, status_code=201)
def create_arena_rink(
    arena_id: str,
    body: ArenaRinkCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    _require_arena(db, arena_id)
    ensure_arena_access(context, arena_id, "arena.manage")
    arena_rink = ArenaRink(arena_id=arena_id, **body.model_dump())
    db.add(arena_rink)
    db.commit()
    db.refresh(arena_rink)
    return _arena_rink_out(arena_rink, db)


@router.get("/arena-rinks/{arena_rink_id}", response_model=ArenaRinkOut)
def get_arena_rink(
    arena_rink_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    arena_rink = _require_arena_rink(db, arena_rink_id)
    return _arena_rink_out(arena_rink, db)


@router.put("/arena-rinks/{arena_rink_id}", response_model=ArenaRinkOut)
def update_arena_rink(
    arena_rink_id: str,
    body: ArenaRinkUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena_rink = _require_arena_rink(db, arena_rink_id)
    ensure_arena_access(context, _arena_id_for_rink(arena_rink), "arena.manage")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(arena_rink, key, value)
    db.commit()
    db.refresh(arena_rink)
    return _arena_rink_out(arena_rink, db)


@router.delete("/arena-rinks/{arena_rink_id}", status_code=204)
def delete_arena_rink(
    arena_rink_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena_rink = _require_arena_rink(db, arena_rink_id)
    ensure_arena_access(context, _arena_id_for_rink(arena_rink), "arena.manage")
    db.delete(arena_rink)
    db.commit()


@router.get("/arena-rinks/{arena_rink_id}/locker-rooms", response_model=list[LockerRoomOut])
def list_locker_rooms(
    arena_rink_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    _require_arena_rink(db, arena_rink_id)
    rooms = (
        db.query(LockerRoom)
        .filter(LockerRoom.arena_rink_id == arena_rink_id)
        .order_by(LockerRoom.display_order, LockerRoom.name)
        .all()
    )
    return [_locker_room_out(room, db) for room in rooms]


@router.post("/arena-rinks/{arena_rink_id}/locker-rooms", response_model=LockerRoomOut, status_code=201)
def create_locker_room(
    arena_rink_id: str,
    body: LockerRoomCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena_rink = _require_arena_rink(db, arena_rink_id)
    ensure_arena_access(context, _arena_id_for_rink(arena_rink), "arena.manage_slots")
    room = LockerRoom(arena_rink_id=arena_rink_id, **body.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return _locker_room_out(room, db)


@router.put("/locker-rooms/{locker_room_id}", response_model=LockerRoomOut)
def update_locker_room(
    locker_room_id: str,
    body: LockerRoomUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    room = _require_locker_room(db, locker_room_id)
    ensure_arena_access(context, _arena_id_for_locker_room(db, room), "arena.manage_slots")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(room, key, value)
    db.commit()
    db.refresh(room)
    return _locker_room_out(room, db)


@router.delete("/locker-rooms/{locker_room_id}", status_code=204)
def delete_locker_room(
    locker_room_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    room = _require_locker_room(db, locker_room_id)
    ensure_arena_access(context, _arena_id_for_locker_room(db, room), "arena.manage_slots")
    db.delete(room)
    db.commit()


@router.get("/arena-rinks/{arena_rink_id}/ice-slots", response_model=list[IceSlotOut])
def list_ice_slots(
    arena_rink_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    _require_arena_rink(db, arena_rink_id)
    query = db.query(IceSlot).filter(IceSlot.arena_rink_id == arena_rink_id)
    if status:
        query = query.filter(IceSlot.status == status)
    else:
        query = query.filter(IceSlot.status != "cancelled")
    if date_from:
        query = query.filter(IceSlot.date >= date_from)
    if date_to:
        query = query.filter(IceSlot.date <= date_to)
    return [_slot_out(slot, db) for slot in query.order_by(IceSlot.date, IceSlot.start_time).all()]


@router.post("/arena-rinks/{arena_rink_id}/ice-slots", response_model=IceSlotOut, status_code=201)
def create_ice_slot(
    arena_rink_id: str,
    body: IceSlotCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena_rink = _require_arena_rink(db, arena_rink_id)
    ensure_arena_access(context, _arena_id_for_rink(arena_rink), "arena.manage_slots")
    _validate_slot_pricing(body.pricing_mode, body.price_amount_cents)
    payload = body.model_dump()
    if payload["pricing_mode"] == "call_for_pricing":
        payload["price_amount_cents"] = None
    slot = IceSlot(arena_rink_id=arena_rink_id, **payload)
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return _slot_out(slot, db)


@router.post("/arena-rinks/{arena_rink_id}/ice-slots/upload", response_model=IceSlotUploadPreview)
async def upload_ice_slots(
    arena_rink_id: str,
    file: UploadFile = File(...),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena_rink = _require_arena_rink(db, arena_rink_id)
    ensure_arena_access(context, _arena_id_for_rink(arena_rink), "arena.manage_slots")
    content = (await file.read()).decode("utf-8-sig")
    return parse_ice_slot_csv(content)


@router.post("/arena-rinks/{arena_rink_id}/ice-slots/confirm-upload", response_model=list[IceSlotOut], status_code=201)
def confirm_ice_slot_upload(
    arena_rink_id: str,
    body: IceSlotConfirmUpload,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    arena_rink = _require_arena_rink(db, arena_rink_id)
    ensure_arena_access(context, _arena_id_for_rink(arena_rink), "arena.manage_slots")
    created: list[IceSlot] = []
    for row in body.entries:
        slot = IceSlot(arena_rink_id=arena_rink_id, **row.model_dump())
        db.add(slot)
        created.append(slot)
    db.commit()
    for slot in created:
        db.refresh(slot)
    return [_slot_out(slot, db) for slot in created]


@router.get("/arena-rinks/{arena_rink_id}/available-ice-slots", response_model=list[IceSlotOut])
def get_available_ice_slots(
    arena_rink_id: str,
    date: date = Query(...),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    _require_arena_rink(db, arena_rink_id)
    slots = (
        db.query(IceSlot)
        .filter(IceSlot.arena_rink_id == arena_rink_id, IceSlot.date == date, IceSlot.status == "available")
        .order_by(IceSlot.start_time)
        .all()
    )
    return [_slot_out(slot, db) for slot in slots]


@router.get("/ice-slots/open", response_model=list[IceSlotOut])
def list_open_ice_slots(
    date_from: date = Query(...),
    date_to: date | None = Query(None),
    arena_id: str | None = Query(None),
    arena_rink_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    query = (
        db.query(IceSlot)
        .join(ArenaRink, ArenaRink.id == IceSlot.arena_rink_id)
        .filter(IceSlot.status == "available", IceSlot.date >= date_from)
    )
    if date_to:
        query = query.filter(IceSlot.date <= date_to)
    else:
        query = query.filter(IceSlot.date == date_from)
    if arena_id:
        _require_arena(db, arena_id)
        query = query.filter(ArenaRink.arena_id == arena_id)
    if arena_rink_id:
        _require_arena_rink(db, arena_rink_id)
        query = query.filter(IceSlot.arena_rink_id == arena_rink_id)
    slots = query.order_by(IceSlot.date, IceSlot.start_time, IceSlot.created_at).all()
    return [_slot_out(slot, db) for slot in slots]


@router.put("/ice-slots/{ice_slot_id}", response_model=IceSlotOut)
def update_ice_slot(
    ice_slot_id: str,
    body: IceSlotUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    slot = _require_ice_slot(db, ice_slot_id)
    ensure_arena_access(context, _arena_id_for_slot(db, slot), "arena.manage_slots")
    if slot.status != "available":
        raise HTTPException(409, "Only open ice slots can be edited")
    conflict_detail = _slot_reference_conflict_detail(db, ice_slot_id)
    if conflict_detail:
        raise HTTPException(409, conflict_detail)
    payload = body.model_dump(exclude_unset=True)
    next_start_time = payload.get("start_time", slot.start_time)
    next_end_time = payload.get("end_time", slot.end_time)
    _validate_time_range(next_start_time, next_end_time)
    next_pricing_mode = payload.get("pricing_mode", slot.pricing_mode)
    next_price_amount_cents = payload.get("price_amount_cents", slot.price_amount_cents)
    _validate_slot_pricing(next_pricing_mode, next_price_amount_cents)
    if next_pricing_mode == "call_for_pricing":
        payload["price_amount_cents"] = None
    for key, value in payload.items():
        setattr(slot, key, value)
    db.commit()
    db.refresh(slot)
    return _slot_out(slot, db)


@router.delete("/ice-slots/{ice_slot_id}", status_code=204)
def delete_ice_slot(
    ice_slot_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    slot = _require_ice_slot(db, ice_slot_id)
    ensure_arena_access(context, _arena_id_for_slot(db, slot), "arena.manage_slots")
    if slot.status != "available":
        raise HTTPException(409, "Only open ice slots can be deleted")
    conflict_detail = _slot_reference_conflict_detail(db, ice_slot_id)
    if conflict_detail:
        raise HTTPException(409, conflict_detail)
    db.delete(slot)
    db.commit()


@router.patch("/arenas/{arena_id}/ice-slots/{ice_slot_id}/cancel", status_code=204)
def cancel_arena_ice_slot(
    arena_id: str,
    ice_slot_id: str,
    body: IceSlotCancel,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_arena_access(context, arena_id, "arena.manage_slots")
    slot = _require_ice_slot(db, ice_slot_id)
    arena_rink = db.get(ArenaRink, slot.arena_rink_id)
    if not arena_rink or arena_rink.arena_id != arena_id:
        raise HTTPException(404, "Ice slot not found for arena")

    if slot.status == "available":
        raise HTTPException(409, "Open slots should be deleted instead of cancelled.")
    if slot.status == "cancelled":
        return Response(status_code=204)

    active_request = (
        db.query(IceBookingRequest)
        .filter(IceBookingRequest.ice_slot_id == slot.id, IceBookingRequest.status.in_(("requested", "accepted")))
        .first()
    )
    if active_request and active_request.status == "requested":
        raise HTTPException(409, "Pending booking requests must be rejected from the Booking Requests section.")

    active_proposals = (
        db.query(Proposal)
        .filter(Proposal.ice_slot_id == slot.id, Proposal.status.in_(("proposed", "accepted")))
        .order_by(Proposal.updated_at.desc())
        .all()
    )
    active_event = (
        db.query(Event)
        .filter(Event.ice_slot_id == slot.id, Event.status != "cancelled")
        .order_by(Event.updated_at.desc())
        .first()
    )

    if active_request and active_request.status == "accepted":
        event = active_request.event
        if event and (event.date < date.today() or event.status == "final"):
            raise HTTPException(400, "Completed bookings cannot be cancelled")
        if event:
            was_recordable = is_recordable_event(event)
            event.status = "cancelled"
            event.home_weekly_confirmed = False
            event.away_weekly_confirmed = False
            _reopen_event_windows(event, db)
            if was_recordable:
                recompute_team_records(db, event.home_team_id)
                if event.away_team_id:
                    recompute_team_records(db, event.away_team_id)
        active_request.status = "cancelled"
        active_request.response_message = body.response_message
        active_request.responded_at = datetime.now(timezone.utc)
        _set_slot_cancelled(slot)
    elif active_proposals:
        for proposal in active_proposals:
            cancel_proposal_record(
                db,
                proposal,
                response_message=body.response_message,
                response_source="arena",
                notify_teams=True,
            )
        _set_slot_cancelled(slot)
    elif active_event:
        if active_event.date < date.today() or active_event.status == "final":
            raise HTTPException(400, "Completed bookings cannot be cancelled")
        was_recordable = is_recordable_event(active_event)
        active_event.status = "cancelled"
        active_event.home_weekly_confirmed = False
        active_event.away_weekly_confirmed = False
        _reopen_event_windows(active_event, db)
        _set_slot_cancelled(slot)
        if was_recordable:
            recompute_team_records(db, active_event.home_team_id)
            if active_event.away_team_id:
                recompute_team_records(db, active_event.away_team_id)
    else:
        _set_slot_cancelled(slot)

    db.commit()
    return Response(status_code=204)


@router.patch("/arenas/{arena_id}/ice-slots/{ice_slot_id}/locker-rooms", status_code=204)
def update_arena_ice_slot_locker_rooms(
    arena_id: str,
    ice_slot_id: str,
    body: EventLockerRoomUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_arena_access(context, arena_id, "arena.manage_booking_requests")
    slot = _require_ice_slot(db, ice_slot_id)
    arena_rink = db.get(ArenaRink, slot.arena_rink_id)
    if not arena_rink or arena_rink.arena_id != arena_id:
        raise HTTPException(404, "Ice slot not found for arena")
    if slot.status != "booked":
        raise HTTPException(409, "Only booked slots can have locker rooms edited")

    event = (
        db.query(Event)
        .filter(Event.ice_slot_id == slot.id, Event.status != "cancelled")
        .order_by(Event.updated_at.desc())
        .first()
    )
    if not event:
        raise HTTPException(409, "No active booking exists for this slot")
    if event_has_started(event):
        raise HTTPException(400, "Locker rooms can only be changed before the slot starts")

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
        booking_request.response_message = _compose_arena_note(
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
    return Response(status_code=204)


@router.get("/arenas/{arena_id}/venue-assignments", response_model=list[TeamSeasonVenueAssignmentOut])
def list_arena_venue_assignments(
    arena_id: str,
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_capability(context, "arena.view")
    _require_arena(db, arena_id)
    query = db.query(TeamSeasonVenueAssignment).filter(TeamSeasonVenueAssignment.arena_id == arena_id)
    if season_id:
        query = query.filter(TeamSeasonVenueAssignment.season_id == season_id)
    return [_venue_assignment_out(assignment, db) for assignment in query.order_by(TeamSeasonVenueAssignment.created_at).all()]
