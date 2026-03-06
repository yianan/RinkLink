from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Team
from ..models.practice_booking import PracticeBooking
from ..models.rink import IceSlot, Rink
from ..schemas.practice_booking import PracticeBookingCreate, PracticeBookingOut

router = APIRouter(tags=["practice_bookings"])


def _enrich(pb: PracticeBooking, db: Session) -> PracticeBookingOut:
    team = db.get(Team, pb.team_id)
    slot = db.get(IceSlot, pb.ice_slot_id)
    rink = db.get(Rink, slot.rink_id) if slot else None

    out = PracticeBookingOut.model_validate(pb)
    out.team_name = team.name if team else None
    if slot:
        out.slot_date = slot.date
        out.slot_start_time = slot.start_time
        out.slot_end_time = slot.end_time
        out.slot_notes = slot.notes
    if rink:
        out.rink_id = rink.id
        out.rink_name = rink.name
        out.rink_city = rink.city
        out.rink_state = rink.state
    return out


@router.post("/teams/{team_id}/practice-bookings", response_model=PracticeBookingOut, status_code=201)
def create_practice_booking(team_id: str, body: PracticeBookingCreate, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")

    slot = db.get(IceSlot, body.ice_slot_id)
    if not slot:
        raise HTTPException(404, "Ice slot not found")
    if slot.status != "available":
        raise HTTPException(409, f"Ice slot is not available (status: {slot.status})")

    slot.status = "booked"
    slot.booked_by_team_id = team_id

    booking = PracticeBooking(
        team_id=team_id,
        ice_slot_id=body.ice_slot_id,
        notes=body.notes,
        status="active",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return _enrich(booking, db)


@router.get("/teams/{team_id}/practice-bookings", response_model=list[PracticeBookingOut])
def list_practice_bookings(
    team_id: str,
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")

    q = db.query(PracticeBooking).filter(PracticeBooking.team_id == team_id)
    if status:
        q = q.filter(PracticeBooking.status == status)

    bookings = q.order_by(PracticeBooking.created_at.asc()).all()
    return [_enrich(pb, db) for pb in bookings]


@router.delete("/practice-bookings/{booking_id}", status_code=204)
def cancel_practice_booking(booking_id: str, db: Session = Depends(get_db)):
    booking = db.get(PracticeBooking, booking_id)
    if not booking:
        raise HTTPException(404, "Practice booking not found")
    if booking.status != "active":
        raise HTTPException(400, f"Cannot cancel booking with status '{booking.status}'")

    slot = db.get(IceSlot, booking.ice_slot_id)
    if slot and slot.status == "booked":
        slot.status = "available"
        slot.booked_by_team_id = None

    booking.status = "cancelled"
    db.commit()
