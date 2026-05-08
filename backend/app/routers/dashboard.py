from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, can_access_team
from ..database import get_db
from ..models import Team
from ..schemas import TeamDashboardSummaryOut
from ..services.competitions import division_standings
from .availability import list_availability
from .competitions import get_team_competition_memberships
from .events import list_events
from .ice_booking_requests import list_team_ice_booking_requests
from .proposals import list_proposals
from .seasons import get_standings

router = APIRouter(tags=["dashboard"])


@router.get("/teams/{team_id}/dashboard-summary", response_model=TeamDashboardSummaryOut)
def get_team_dashboard_summary(
    team_id: str,
    date_from: date | None = Query(None),
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not can_access_team(context, team, "team.view", allow_linked_family=True):
        raise HTTPException(403, "You do not have access to this team")

    can_manage_schedule = "team.manage_schedule" in context.capabilities
    can_manage_proposals = "team.manage_proposals" in context.capabilities
    can_view_private_roster = "team.view_private" in context.capabilities
    family_mode = (
        not can_manage_schedule
        and not can_manage_proposals
        and not can_view_private_roster
        and bool(context.guardianships or context.player_memberships)
    )

    availability = (
        list_availability(
            team_id=team_id,
            status=None,
            date_from=None,
            date_to=None,
            season_id=None,
            limit=200,
            offset=0,
            context=context,
            db=db,
        )
        if can_manage_schedule
        else []
    )
    events = list_events(
        team_id=team_id,
        status=None,
        date_from=date_from,
        date_to=None,
        season_id=None,
        limit=200,
        offset=0,
        include_total=False,
        response=None,
        context=context,
        db=db,
    )
    proposals = (
        list_proposals(
            team_id=team_id,
            status="proposed",
            status_in=None,
            direction="incoming",
            date_from=None,
            date_to=None,
            limit=100,
            offset=0,
            response=None,
            context=context,
            db=db,
        )
        if can_manage_proposals
        else []
    )
    booking_requests = (
        list_team_ice_booking_requests(
            team_id=team_id,
            status="requested",
            limit=100,
            offset=0,
            response=None,
            context=context,
            db=db,
        )
        if can_manage_schedule
        else []
    )

    record = None
    competition_record = None
    primary_membership = None
    if season_id and not family_mode:
        standings = get_standings(
            id=season_id,
            association_id=None,
            age_group=None,
            level=None,
            db=db,
        )
        record = next((entry for entry in standings if entry.team_id == team_id), None)

        memberships = get_team_competition_memberships(team_id=team_id, season_id=season_id, context=context, db=db)
        primary_membership = next((membership for membership in memberships if membership.is_primary), None) or (memberships[0] if memberships else None)
        standings_membership = (
            next((membership for membership in memberships if membership.is_primary and membership.standings_enabled), None)
            or next((membership for membership in memberships if membership.standings_enabled), None)
        )
        if standings_membership:
            division_entries = division_standings(db, standings_membership.competition_division_id)
            competition_record = next((entry for entry in division_entries if entry.team_id == team_id), None)

    return TeamDashboardSummaryOut(
        availability=availability,
        events=events,
        proposals=proposals,
        booking_requests=booking_requests,
        record=record,
        competition_record=competition_record,
        primary_membership=primary_membership,
    )
