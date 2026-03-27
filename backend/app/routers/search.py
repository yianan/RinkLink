from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Association, Arena, AvailabilityWindow, Proposal, Team, TeamSeasonVenueAssignment
from ..schemas.search import AutoMatchResult, OpponentResult
from ..services.competitions import primary_membership_for_team
from ..services.distance import get_distance
from ..services.matching import find_auto_matches
from ..services.team_logos import effective_team_logo_url

router = APIRouter(tags=["search"])


def _team_origin_zip(db: Session, team: Team, season_id: str | None) -> str | None:
    if season_id:
        assignment = (
            db.query(TeamSeasonVenueAssignment)
            .filter(TeamSeasonVenueAssignment.team_id == team.id, TeamSeasonVenueAssignment.season_id == season_id)
            .first()
        )
        if assignment and assignment.arena:
            return assignment.arena.zip_code
    assoc = db.get(Association, team.association_id)
    return assoc.zip_code if assoc else None


@router.get("/search/opponents", response_model=list[OpponentResult])
def search_opponents(
    team_id: str = Query(...),
    availability_window_id: str = Query(...),
    max_distance_miles: float | None = Query(None),
    level: str | None = Query(None),
    age_group: str | None = Query(None),
    min_ranking: int | None = Query(None),
    max_ranking: int | None = Query(None),
    arena_id: str | None = Query(None),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    my_window = db.get(AvailabilityWindow, availability_window_id)
    if not my_window:
        raise HTTPException(404, "Availability window not found")
    if my_window.team_id != team_id:
        raise HTTPException(400, "Availability window does not belong to team")
    if my_window.status != "open":
        raise HTTPException(400, "Availability window is not open")
    if my_window.start_time is None:
        return []

    opposite_type = "away" if my_window.availability_type == "home" else "home"
    query = (
        db.query(AvailabilityWindow)
        .join(Team, AvailabilityWindow.team_id == Team.id)
        .filter(
            AvailabilityWindow.date == my_window.date,
            AvailabilityWindow.start_time == my_window.start_time,
            AvailabilityWindow.availability_type == opposite_type,
            AvailabilityWindow.status == "open",
            AvailabilityWindow.blocked == False,  # noqa: E712
            Team.id != team_id,
        )
    )
    if my_window.season_id:
        query = query.filter(AvailabilityWindow.season_id == my_window.season_id)
    target_age = age_group or team.age_group
    query = query.filter(Team.age_group == target_age)
    if level:
        query = query.filter(Team.level == level)
    if min_ranking is not None:
        query = query.filter(Team.myhockey_ranking >= min_ranking)
    if max_ranking is not None:
        query = query.filter(Team.myhockey_ranking <= max_ranking)

    base_zip = _team_origin_zip(db, team, my_window.season_id)
    if arena_id:
        arena = db.get(Arena, arena_id)
        if arena and arena.zip_code:
            base_zip = arena.zip_code

    windows = query.all()
    window_ids = [window.id for window in windows]
    proposals = (
        db.query(Proposal)
        .filter(
            Proposal.status.in_(("proposed", "accepted")),
            (
                ((Proposal.home_availability_window_id == my_window.id) & (Proposal.away_availability_window_id.in_(window_ids)))
                | ((Proposal.away_availability_window_id == my_window.id) & (Proposal.home_availability_window_id.in_(window_ids)))
            ),
        )
        .order_by(Proposal.updated_at.desc())
        .all()
        if window_ids else []
    )
    existing_by_pair: dict[str, Proposal] = {}
    for proposal in proposals:
        key = "|".join(sorted([proposal.home_availability_window_id, proposal.away_availability_window_id]))
        existing_by_pair.setdefault(key, proposal)

    results: list[OpponentResult] = []
    for window in windows:
        opp_team = db.get(Team, window.team_id)
        if not opp_team:
            continue
        assoc = db.get(Association, opp_team.association_id)
        membership = primary_membership_for_team(db, opp_team.id, my_window.season_id)
        dist = get_distance(db, base_zip, _team_origin_zip(db, opp_team, window.season_id))
        if max_distance_miles is not None and dist is not None and dist > max_distance_miles:
            continue
        pair_key = "|".join(sorted([my_window.id, window.id]))
        existing = existing_by_pair.get(pair_key)
        results.append(
            OpponentResult(
                team_id=opp_team.id,
                team_name=opp_team.name,
                team_logo_url=effective_team_logo_url(opp_team, assoc),
                association_name=assoc.name if assoc else "",
                age_group=opp_team.age_group,
                level=opp_team.level,
                myhockey_ranking=opp_team.myhockey_ranking,
                distance_miles=dist,
                availability_window_id=window.id,
                entry_date=window.date,
                start_time=window.start_time,
                end_time=window.end_time,
                availability_type=window.availability_type,
                primary_competition_short_name=membership.competition_short_name if membership else None,
                primary_division_name=membership.division_name if membership else None,
                has_existing_proposal=existing is not None,
                existing_proposal_id=existing.id if existing else None,
                existing_proposal_status=existing.status if existing else None,
            )
        )

    results.sort(key=lambda result: result.distance_miles if result.distance_miles is not None else 9999)
    return results


@router.get("/search/auto-matches", response_model=list[AutoMatchResult])
def auto_matches(team_id: str = Query(...), db: Session = Depends(get_db)):
    return find_auto_matches(db, team_id)
