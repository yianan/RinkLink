from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ScheduleEntry, Team
from ..models.game import Game
from ..schemas import ScheduleEntryCreate, ScheduleEntryUpdate, ScheduleEntryOut
from ..schemas.schedule_entry import ScheduleUploadPreview, ScheduleConfirmUpload
from ..services.csv_parser import parse_csv
from ..services.season_utils import resolve_season_id

router = APIRouter(tags=["schedules"])


def _schedule_status_for_game(game_status: str) -> str:
    return "confirmed" if game_status in {"confirmed", "final"} else "scheduled"


def _normalized_schedule_entry(
    *,
    team_id: str,
    team_names: dict[str, str],
    game: Game,
    role: str,
    entry: ScheduleEntry | None,
) -> ScheduleEntryOut:
    opponent_team_id = game.away_team_id if role == "home" else game.home_team_id
    weekly_confirmed = game.home_weekly_confirmed if role == "home" else game.away_weekly_confirmed
    if game.status == "confirmed":
        weekly_confirmed = True
    base = ScheduleEntryOut.model_validate(entry) if entry else ScheduleEntryOut(
        id=f"game:{game.id}:{team_id}",
        team_id=team_id,
        season_id=game.season_id,
        date=game.date,
        time=game.time,
        entry_type=role,
        status=_schedule_status_for_game(game.status),
        opponent_name=team_names.get(opponent_team_id),
        opponent_team_id=opponent_team_id,
        location=None,
        notes=None,
        weekly_confirmed=weekly_confirmed,
        blocked=False,
        game_id=game.id,
        created_at=game.created_at,
        updated_at=game.updated_at,
    )
    return base.model_copy(update={
        "entry_type": role,
        "status": _schedule_status_for_game(game.status),
        "opponent_name": team_names.get(opponent_team_id),
        "opponent_team_id": opponent_team_id,
        "weekly_confirmed": weekly_confirmed,
        "game_id": game.id,
    })


@router.get("/teams/{team_id}/schedule", response_model=list[ScheduleEntryOut])
def list_schedule(
    team_id: str,
    status: str | None = Query(None),
    entry_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    season_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    if not db.get(Team, team_id):
        raise HTTPException(404, "Team not found")
    q = db.query(ScheduleEntry).filter(ScheduleEntry.team_id == team_id)
    if date_from:
        q = q.filter(ScheduleEntry.date >= date_from)
    if date_to:
        q = q.filter(ScheduleEntry.date <= date_to)
    if season_id:
        q = q.filter(ScheduleEntry.season_id == season_id)
    entries = q.order_by(ScheduleEntry.date, ScheduleEntry.time).all()

    games_query = db.query(Game).filter((Game.home_team_id == team_id) | (Game.away_team_id == team_id))
    if date_from:
        games_query = games_query.filter(Game.date >= date_from)
    if date_to:
        games_query = games_query.filter(Game.date <= date_to)
    if season_id:
        games_query = games_query.filter(Game.season_id == season_id)
    games = games_query.filter(Game.status.in_(("scheduled", "confirmed", "final"))).order_by(Game.date, Game.time).all()

    team_ids = {team_id}
    for game in games:
        team_ids.add(game.home_team_id)
        team_ids.add(game.away_team_id)
    team_names = {
        row.id: row.name
        for row in db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all()
    }

    entries_by_id = {entry.id: entry for entry in entries}
    entries_by_slot: dict[tuple[date, object | None], list[ScheduleEntry]] = {}
    for entry in entries:
        entries_by_slot.setdefault((entry.date, entry.time), []).append(entry)

    matched_entry_ids: set[str] = set()
    normalized: list[ScheduleEntryOut] = []

    for game in games:
        role = "home" if game.home_team_id == team_id else "away"
        explicit_entry_id = game.home_schedule_entry_id if role == "home" else game.away_schedule_entry_id
        matched_entry = entries_by_id.get(explicit_entry_id) if explicit_entry_id else None
        if matched_entry is None:
            slot_entries = entries_by_slot.get((game.date, game.time), [])
            matched_entry = next((entry for entry in slot_entries if entry.entry_type == role), None)
            if matched_entry is None:
                matched_entry = slot_entries[0] if slot_entries else None
        if matched_entry:
            matched_entry_ids.add(matched_entry.id)
        normalized.append(
            _normalized_schedule_entry(
                team_id=team_id,
                team_names=team_names,
                game=game,
                role=role,
                entry=matched_entry,
            )
        )

    for entry in entries:
        if entry.id in matched_entry_ids:
            continue
        normalized.append(ScheduleEntryOut.model_validate(entry))

    if status:
        normalized = [entry for entry in normalized if entry.status == status]
    if entry_type:
        normalized = [entry for entry in normalized if entry.entry_type == entry_type]

    normalized.sort(key=lambda entry: (entry.date.isoformat(), entry.time.isoformat() if entry.time else ""))
    return normalized


@router.post("/teams/{team_id}/schedule", response_model=ScheduleEntryOut, status_code=201)
def create_schedule_entry(team_id: str, body: ScheduleEntryCreate, db: Session = Depends(get_db)):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    data = body.model_dump()
    if not data.get("season_id"):
        data["season_id"] = resolve_season_id(db, body.date)
    entry = ScheduleEntry(team_id=team_id, **data)
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
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    created = []
    for row in body.entries:
        data = row.model_dump()
        data["season_id"] = resolve_season_id(db, row.date)
        entry = ScheduleEntry(team_id=team_id, **data)
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
