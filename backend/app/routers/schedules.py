from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ScheduleEntry, Team
from ..models.game import Game
from ..schemas import ScheduleEntryCreate, ScheduleEntryUpdate, ScheduleEntryOut
from ..schemas.schedule_entry import ScheduleUploadPreview, ScheduleConfirmUpload
from ..services.csv_parser import parse_csv

router = APIRouter(tags=["schedules"])


@router.get("/teams/{team_id}/schedule", response_model=list[ScheduleEntryOut])
def list_schedule(
    team_id: str,
    status: str | None = Query(None),
    entry_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    q = db.query(ScheduleEntry).filter(ScheduleEntry.team_id == team_id)
    if status:
        q = q.filter(ScheduleEntry.status == status)
    if entry_type:
        q = q.filter(ScheduleEntry.entry_type == entry_type)
    if date_from:
        q = q.filter(ScheduleEntry.date >= date_from)
    if date_to:
        q = q.filter(ScheduleEntry.date <= date_to)
    entries = q.order_by(ScheduleEntry.date, ScheduleEntry.time).all()

    entry_ids = [e.id for e in entries]
    game_id_map: dict[str, str] = {}
    if entry_ids:
        games = db.query(Game).filter(
            (Game.home_schedule_entry_id.in_(entry_ids)) |
            (Game.away_schedule_entry_id.in_(entry_ids))
        ).all()
        for g in games:
            if g.home_schedule_entry_id in entry_ids:
                game_id_map[g.home_schedule_entry_id] = g.id
            if g.away_schedule_entry_id in entry_ids:
                game_id_map[g.away_schedule_entry_id] = g.id

    return [
        ScheduleEntryOut.model_validate(e).model_copy(update={"game_id": game_id_map.get(e.id)})
        for e in entries
    ]


@router.post("/teams/{team_id}/schedule", response_model=ScheduleEntryOut, status_code=201)
def create_schedule_entry(team_id: str, body: ScheduleEntryCreate, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    entry = ScheduleEntry(team_id=team_id, **body.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/teams/{team_id}/schedule/upload", response_model=ScheduleUploadPreview)
async def upload_schedule(team_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    content = (await file.read()).decode("utf-8-sig")
    return parse_csv(content)


@router.post("/teams/{team_id}/schedule/confirm-upload", response_model=list[ScheduleEntryOut], status_code=201)
def confirm_upload(team_id: str, body: ScheduleConfirmUpload, db: Session = Depends(get_db)):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    created = []
    for row in body.entries:
        entry = ScheduleEntry(team_id=team_id, **row.model_dump())
        db.add(entry)
        created.append(entry)
    db.commit()
    for e in created:
        db.refresh(e)
    return created


@router.put("/schedule-entries/{id}", response_model=ScheduleEntryOut)
def update_schedule_entry(id: str, body: ScheduleEntryUpdate, db: Session = Depends(get_db)):
    entry = db.get(ScheduleEntry, id)
    if not entry:
        raise HTTPException(404, "Schedule entry not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(entry, k, v)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/schedule-entries/{id}", status_code=204)
def delete_schedule_entry(id: str, db: Session = Depends(get_db)):
    entry = db.get(ScheduleEntry, id)
    if not entry:
        raise HTTPException(404, "Schedule entry not found")
    db.delete(entry)
    db.commit()


