from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AvailabilityWindow, Event, Team
from ..schemas import (
    AvailabilityConfirmUpload,
    AvailabilityUploadPreview,
    AvailabilityWindowCreate,
    AvailabilityWindowOut,
    AvailabilityWindowUpdate,
)
from ..services.csv_parser import parse_csv
from ..services.season_utils import resolve_season_id

router = APIRouter(tags=["availability"])


def _validate_time_range(start_time, end_time) -> None:
    if start_time is not None and end_time is not None and end_time < start_time:
        raise HTTPException(400, "End time must be the same as or later than start time")


def _out(window: AvailabilityWindow, db: Session) -> AvailabilityWindowOut:
    out = AvailabilityWindowOut.model_validate(window)
    event = (
        db.query(Event)
        .filter(
            (Event.home_availability_window_id == window.id) | (Event.away_availability_window_id == window.id),
            Event.status.in_(("scheduled", "confirmed", "final")),
        )
        .first()
    )
    out.event_id = event.id if event else None
    return out


@router.get("/teams/{team_id}/availability", response_model=list[AvailabilityWindowOut])
def list_availability(team_id: str, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    windows = (
        db.query(AvailabilityWindow)
        .filter(AvailabilityWindow.team_id == team_id)
        .order_by(AvailabilityWindow.date, AvailabilityWindow.start_time)
        .all()
    )
    return [_out(window, db) for window in windows]


@router.post("/teams/{team_id}/availability", response_model=AvailabilityWindowOut, status_code=201)
def create_availability(team_id: str, body: AvailabilityWindowCreate, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    data = body.model_dump()
    if not data.get("season_id"):
        data["season_id"] = resolve_season_id(db, body.date)
    window = AvailabilityWindow(team_id=team_id, **data)
    db.add(window)
    db.commit()
    db.refresh(window)
    return _out(window, db)


@router.post("/teams/{team_id}/availability/upload", response_model=AvailabilityUploadPreview)
async def upload_availability(team_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    content = (await file.read()).decode("utf-8-sig")
    return parse_csv(content)


@router.post("/teams/{team_id}/availability/confirm-upload", response_model=list[AvailabilityWindowOut], status_code=201)
def confirm_availability_upload(team_id: str, body: AvailabilityConfirmUpload, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    created: list[AvailabilityWindow] = []
    for row in body.entries:
        entry = AvailabilityWindow(
            team_id=team_id,
            season_id=resolve_season_id(db, row.date),
            **row.model_dump(),
        )
        db.add(entry)
        created.append(entry)
    db.commit()
    for entry in created:
        db.refresh(entry)
    return [_out(entry, db) for entry in created]


@router.put("/availability-windows/{availability_window_id}", response_model=AvailabilityWindowOut)
def update_availability(availability_window_id: str, body: AvailabilityWindowUpdate, db: Session = Depends(get_db)):
    window = db.get(AvailabilityWindow, availability_window_id)
    if not window:
        raise HTTPException(404, "Availability window not found")
    next_start_time = body.start_time if body.start_time is not None else window.start_time
    next_end_time = body.end_time if body.end_time is not None else window.end_time
    _validate_time_range(next_start_time, next_end_time)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(window, key, value)
    db.commit()
    db.refresh(window)
    return _out(window, db)


@router.delete("/availability-windows/{availability_window_id}", status_code=204)
def delete_availability(availability_window_id: str, db: Session = Depends(get_db)):
    window = db.get(AvailabilityWindow, availability_window_id)
    if not window:
        raise HTTPException(404, "Availability window not found")
    db.delete(window)
    db.commit()
