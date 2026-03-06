from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Team, ScheduleEntry, Association, GameProposal
from ..models.rink import Rink, IceSlot
from ..schemas.search import OpponentResult, AutoMatchResult
from ..schemas.rink import IceSlotOut
from ..services.distance import get_distance
from ..services.matching import find_auto_matches

router = APIRouter(tags=["search"])


@router.get("/search/opponents", response_model=list[OpponentResult])
def search_opponents(
    team_id: str = Query(...),
    schedule_entry_id: str | None = Query(None, description="Preferred. Open schedule entry ID to match against."),
    date: date | None = Query(None, description="Deprecated. Use schedule_entry_id."),
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

    # Find the requesting team's open entry for this date/time
    if schedule_entry_id:
        my_entry = db.get(ScheduleEntry, schedule_entry_id)
        if not my_entry:
            raise HTTPException(404, "Schedule entry not found")
        if my_entry.team_id != team_id:
            raise HTTPException(400, "Schedule entry does not belong to team")
        if my_entry.status != "open":
            raise HTTPException(400, "Schedule entry is not open")
    else:
        if date is None:
            raise HTTPException(400, "Either schedule_entry_id or date is required")
        my_entry = (
            db.query(ScheduleEntry)
            .filter(
                ScheduleEntry.team_id == team_id,
                ScheduleEntry.date == date,
                ScheduleEntry.status == "open",
            )
            .order_by(ScheduleEntry.time)
            .first()
        )
    if not my_entry:
        return []

    if my_entry.time is None:
        return []

    opposite_type = "away" if my_entry.entry_type == "home" else "home"

    q = (
        db.query(ScheduleEntry)
        .join(Team, ScheduleEntry.team_id == Team.id)
        .filter(
            ScheduleEntry.date == my_entry.date,
            ScheduleEntry.time == my_entry.time,
            ScheduleEntry.entry_type == opposite_type,
            ScheduleEntry.status == "open",
            ScheduleEntry.blocked == False,  # noqa: E712
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
    base_zip = team.rink_zip
    if rink_id:
        rink = db.get(Rink, rink_id)
        if rink and rink.zip_code:
            base_zip = rink.zip_code

    entries = q.all()
    existing_by_pair: dict[str, GameProposal] = {}
    if entries:
        opp_entry_ids = [e.id for e in entries]
        proposals = (
            db.query(GameProposal)
            .filter(
                GameProposal.status.in_(("proposed", "accepted")),
                (
                    ((GameProposal.home_schedule_entry_id == my_entry.id) & (GameProposal.away_schedule_entry_id.in_(opp_entry_ids)))
                    | ((GameProposal.away_schedule_entry_id == my_entry.id) & (GameProposal.home_schedule_entry_id.in_(opp_entry_ids)))
                ),
            )
            .order_by(GameProposal.updated_at.desc())
            .all()
        )
        for p in proposals:
            key = "|".join(sorted([p.home_schedule_entry_id, p.away_schedule_entry_id]))
            if key not in existing_by_pair:
                existing_by_pair[key] = p

    for entry in entries:
        opp_team = db.get(Team, entry.team_id)
        if not opp_team:
            continue
        assoc = db.get(Association, opp_team.association_id)

        dist = get_distance(db, base_zip, opp_team.rink_zip)
        if max_distance_miles is not None and dist is not None and dist > max_distance_miles:
            continue

        pair_key = "|".join(sorted([my_entry.id, entry.id]))
        existing = existing_by_pair.get(pair_key)
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
            has_existing_proposal=existing is not None,
            existing_proposal_id=existing.id if existing else None,
            existing_proposal_status=existing.status if existing else None,
        ))

    results.sort(key=lambda r: r.distance_miles if r.distance_miles is not None else 9999)
    return results


@router.get("/search/auto-matches", response_model=list[AutoMatchResult])
def auto_matches(team_id: str = Query(...), db: Session = Depends(get_db)):
    return find_auto_matches(db, team_id)
