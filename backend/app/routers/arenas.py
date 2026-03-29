from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Arena, ArenaRink, Event, IceBookingRequest, IceSlot, LockerRoom, Proposal, TeamSeasonVenueAssignment
from ..schemas import (
    ArenaCreate,
    ArenaOut,
    ArenaRinkCreate,
    ArenaRinkOut,
    ArenaRinkUpdate,
    ArenaUpdate,
    IceSlotConfirmUpload,
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

router = APIRouter(tags=["arenas"])


def _validate_slot_pricing(pricing_mode: str, price_amount_cents: int | None) -> None:
    if pricing_mode == "fixed_price" and price_amount_cents is None:
        raise HTTPException(400, "Fixed-price slots require a price")


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
    out.ice_slot_count = db.query(IceSlot).filter(IceSlot.arena_rink_id == arena_rink.id).count()
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
    return out


def _venue_assignment_out(assignment: TeamSeasonVenueAssignment, db: Session) -> TeamSeasonVenueAssignmentOut:
    out = TeamSeasonVenueAssignmentOut.model_validate(assignment)
    out.team_name = assignment.team.name if assignment.team else None
    out.arena_name = assignment.arena.name if assignment.arena else None
    out.arena_rink_name = assignment.arena_rink.name if assignment.arena_rink else None
    out.default_locker_room_name = assignment.default_locker_room.name if assignment.default_locker_room else None
    return out


@router.get("/arenas", response_model=list[ArenaOut])
def list_arenas(db: Session = Depends(get_db)):
    return [_arena_out(arena, db) for arena in db.query(Arena).order_by(Arena.name).all()]


@router.post("/arenas", response_model=ArenaOut, status_code=201)
def create_arena(body: ArenaCreate, db: Session = Depends(get_db)):
    arena = Arena(**body.model_dump())
    db.add(arena)
    db.commit()
    db.refresh(arena)
    return _arena_out(arena, db)


@router.get("/arenas/{arena_id}", response_model=ArenaOut)
def get_arena(arena_id: str, db: Session = Depends(get_db)):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    return _arena_out(arena, db)


@router.put("/arenas/{arena_id}", response_model=ArenaOut)
def update_arena(arena_id: str, body: ArenaUpdate, db: Session = Depends(get_db)):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(arena, key, value)
    db.commit()
    db.refresh(arena)
    return _arena_out(arena, db)


@router.post("/arenas/{arena_id}/logo", response_model=ArenaOut)
async def upload_arena_logo(arena_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    previous_logo_path = arena.logo_path
    arena.logo_path = await save_arena_logo_upload(arena_id, file)
    db.commit()
    db.refresh(arena)
    delete_arena_logo_if_unused(db, previous_logo_path, ignore_arena_id=arena.id)
    return _arena_out(arena, db)


@router.delete("/arenas/{arena_id}/logo", response_model=ArenaOut)
def delete_arena_logo(arena_id: str, db: Session = Depends(get_db)):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    previous_logo_path = arena.logo_path
    arena.logo_path = None
    db.commit()
    db.refresh(arena)
    delete_arena_logo_if_unused(db, previous_logo_path, ignore_arena_id=arena.id)
    return _arena_out(arena, db)


@router.delete("/arenas/{arena_id}", status_code=204)
def delete_arena(arena_id: str, db: Session = Depends(get_db)):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
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
def list_arena_rinks(arena_id: str, db: Session = Depends(get_db)):
    if not db.get(Arena, arena_id):
        raise HTTPException(404, "Arena not found")
    rinks = (
        db.query(ArenaRink)
        .filter(ArenaRink.arena_id == arena_id)
        .order_by(ArenaRink.display_order, ArenaRink.name)
        .all()
    )
    return [_arena_rink_out(rink, db) for rink in rinks]


@router.post("/arenas/{arena_id}/rinks", response_model=ArenaRinkOut, status_code=201)
def create_arena_rink(arena_id: str, body: ArenaRinkCreate, db: Session = Depends(get_db)):
    if not db.get(Arena, arena_id):
        raise HTTPException(404, "Arena not found")
    arena_rink = ArenaRink(arena_id=arena_id, **body.model_dump())
    db.add(arena_rink)
    db.commit()
    db.refresh(arena_rink)
    return _arena_rink_out(arena_rink, db)


@router.get("/arena-rinks/{arena_rink_id}", response_model=ArenaRinkOut)
def get_arena_rink(arena_rink_id: str, db: Session = Depends(get_db)):
    arena_rink = db.get(ArenaRink, arena_rink_id)
    if not arena_rink:
        raise HTTPException(404, "Arena rink not found")
    return _arena_rink_out(arena_rink, db)


@router.put("/arena-rinks/{arena_rink_id}", response_model=ArenaRinkOut)
def update_arena_rink(arena_rink_id: str, body: ArenaRinkUpdate, db: Session = Depends(get_db)):
    arena_rink = db.get(ArenaRink, arena_rink_id)
    if not arena_rink:
        raise HTTPException(404, "Arena rink not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(arena_rink, key, value)
    db.commit()
    db.refresh(arena_rink)
    return _arena_rink_out(arena_rink, db)


@router.delete("/arena-rinks/{arena_rink_id}", status_code=204)
def delete_arena_rink(arena_rink_id: str, db: Session = Depends(get_db)):
    arena_rink = db.get(ArenaRink, arena_rink_id)
    if not arena_rink:
        raise HTTPException(404, "Arena rink not found")
    db.delete(arena_rink)
    db.commit()


@router.get("/arena-rinks/{arena_rink_id}/locker-rooms", response_model=list[LockerRoomOut])
def list_locker_rooms(arena_rink_id: str, db: Session = Depends(get_db)):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
    rooms = (
        db.query(LockerRoom)
        .filter(LockerRoom.arena_rink_id == arena_rink_id)
        .order_by(LockerRoom.display_order, LockerRoom.name)
        .all()
    )
    return [_locker_room_out(room, db) for room in rooms]


@router.post("/arena-rinks/{arena_rink_id}/locker-rooms", response_model=LockerRoomOut, status_code=201)
def create_locker_room(arena_rink_id: str, body: LockerRoomCreate, db: Session = Depends(get_db)):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
    room = LockerRoom(arena_rink_id=arena_rink_id, **body.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return _locker_room_out(room, db)


@router.put("/locker-rooms/{locker_room_id}", response_model=LockerRoomOut)
def update_locker_room(locker_room_id: str, body: LockerRoomUpdate, db: Session = Depends(get_db)):
    room = db.get(LockerRoom, locker_room_id)
    if not room:
        raise HTTPException(404, "Locker room not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(room, key, value)
    db.commit()
    db.refresh(room)
    return _locker_room_out(room, db)


@router.delete("/locker-rooms/{locker_room_id}", status_code=204)
def delete_locker_room(locker_room_id: str, db: Session = Depends(get_db)):
    room = db.get(LockerRoom, locker_room_id)
    if not room:
        raise HTTPException(404, "Locker room not found")
    db.delete(room)
    db.commit()


@router.get("/arena-rinks/{arena_rink_id}/ice-slots", response_model=list[IceSlotOut])
def list_ice_slots(
    arena_rink_id: str,
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
    query = db.query(IceSlot).filter(IceSlot.arena_rink_id == arena_rink_id)
    if status:
        query = query.filter(IceSlot.status == status)
    if date_from:
        query = query.filter(IceSlot.date >= date_from)
    if date_to:
        query = query.filter(IceSlot.date <= date_to)
    return [_slot_out(slot, db) for slot in query.order_by(IceSlot.date, IceSlot.start_time).all()]


@router.post("/arena-rinks/{arena_rink_id}/ice-slots", response_model=IceSlotOut, status_code=201)
def create_ice_slot(arena_rink_id: str, body: IceSlotCreate, db: Session = Depends(get_db)):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
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
async def upload_ice_slots(arena_rink_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
    content = (await file.read()).decode("utf-8-sig")
    return parse_ice_slot_csv(content)


@router.post("/arena-rinks/{arena_rink_id}/ice-slots/confirm-upload", response_model=list[IceSlotOut], status_code=201)
def confirm_ice_slot_upload(arena_rink_id: str, body: IceSlotConfirmUpload, db: Session = Depends(get_db)):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
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
def get_available_ice_slots(arena_rink_id: str, date: date = Query(...), db: Session = Depends(get_db)):
    if not db.get(ArenaRink, arena_rink_id):
        raise HTTPException(404, "Arena rink not found")
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
    db: Session = Depends(get_db),
):
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
        if not db.get(Arena, arena_id):
            raise HTTPException(404, "Arena not found")
        query = query.filter(ArenaRink.arena_id == arena_id)
    if arena_rink_id:
        arena_rink = db.get(ArenaRink, arena_rink_id)
        if not arena_rink:
            raise HTTPException(404, "Arena rink not found")
        query = query.filter(IceSlot.arena_rink_id == arena_rink_id)
    slots = query.order_by(IceSlot.date, IceSlot.start_time, IceSlot.created_at).all()
    return [_slot_out(slot, db) for slot in slots]


@router.put("/ice-slots/{ice_slot_id}", response_model=IceSlotOut)
def update_ice_slot(ice_slot_id: str, body: IceSlotUpdate, db: Session = Depends(get_db)):
    slot = db.get(IceSlot, ice_slot_id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    if slot.status != "available":
        raise HTTPException(409, "Only open ice slots can be edited")
    payload = body.model_dump(exclude_unset=True)
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
def delete_ice_slot(ice_slot_id: str, db: Session = Depends(get_db)):
    slot = db.get(IceSlot, ice_slot_id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    active_request_count = db.query(IceBookingRequest).filter(IceBookingRequest.ice_slot_id == ice_slot_id, IceBookingRequest.status.in_(("requested", "accepted"))).count()
    if slot.status != "available" or active_request_count:
        raise HTTPException(409, "Only open ice slots without booking requests can be deleted")
    db.delete(slot)
    db.commit()


@router.get("/arenas/{arena_id}/venue-assignments", response_model=list[TeamSeasonVenueAssignmentOut])
def list_arena_venue_assignments(arena_id: str, season_id: str | None = Query(None), db: Session = Depends(get_db)):
    if not db.get(Arena, arena_id):
        raise HTTPException(404, "Arena not found")
    query = db.query(TeamSeasonVenueAssignment).filter(TeamSeasonVenueAssignment.arena_id == arena_id)
    if season_id:
        query = query.filter(TeamSeasonVenueAssignment.season_id == season_id)
    return [_venue_assignment_out(assignment, db) for assignment in query.order_by(TeamSeasonVenueAssignment.created_at).all()]
