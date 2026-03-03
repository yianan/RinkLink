from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Team, ScheduleEntry, Association
from ..models.rink import Rink, IceSlot
from ..schemas.search import OpponentResult, AutoMatchResult
from ..schemas.rink import IceSlotOut
from ..services.distance import get_distance
from ..services.matching import find_auto_matches

router = APIRouter(tags=["search"])


@router.get("/search/opponents", response_model=list[OpponentResult])
def search_opponents(
    team_id: str = Query(...),
    date: date = Query(...),
    max_distance_miles: float | None = Query(None),
    level: str | None = Query(None),
    age_group: str | None = Query(None),
    min_ranking: int | None = Query(None),
    max_ranking: int | None = Query(None),
    rink_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    # Find the requesting team's open entry for this date
    my_entry = (
        db.query(ScheduleEntry)
        .filter(
            ScheduleEntry.team_id == team_id,
            ScheduleEntry.date == date,
            ScheduleEntry.status == "open",
        )
        .first()
    )
    if not my_entry:
        return []

    opposite_type = "away" if my_entry.entry_type == "home" else "home"

    q = (
        db.query(ScheduleEntry)
        .join(Team, ScheduleEntry.team_id == Team.id)
        .filter(
            ScheduleEntry.date == date,
            ScheduleEntry.entry_type == opposite_type,
            ScheduleEntry.status == "open",
            Team.id != team_id,
        )
    )

    target_age = age_group or team.age_group
    q = q.filter(Team.age_group == target_age)

    if level:
        q = q.filter(Team.level == level)
    if min_ranking is not None:
        q = q.filter(Team.myhockey_ranking >= min_ranking)
    if max_ranking is not None:
        q = q.filter(Team.myhockey_ranking <= max_ranking)

    results: list[OpponentResult] = []
    for entry in q.all():
        opp_team = db.get(Team, entry.team_id)
        if not opp_team:
            continue
        assoc = db.get(Association, opp_team.association_id)

        dist = get_distance(db, team.rink_zip, opp_team.rink_zip)
        if max_distance_miles is not None and dist is not None and dist > max_distance_miles:
            continue

        results.append(OpponentResult(
            team_id=opp_team.id,
            team_name=opp_team.name,
            association_name=assoc.name if assoc else "",
            age_group=opp_team.age_group,
            level=opp_team.level,
            myhockey_ranking=opp_team.myhockey_ranking,
            distance_miles=dist,
            schedule_entry_id=entry.id,
            entry_date=entry.date,
            entry_time=entry.time,
            entry_type=entry.entry_type,
        ))

    results.sort(key=lambda r: r.distance_miles if r.distance_miles is not None else 9999)
    return results


@router.get("/search/auto-matches", response_model=list[AutoMatchResult])
def auto_matches(team_id: str = Query(...), db: Session = Depends(get_db)):
    return find_auto_matches(db, team_id)
