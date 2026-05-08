from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, can_access_team
from ..database import get_db
from ..models import Association, Event, IceBookingRequest, Proposal, Season, Team
from ..schemas import StandingsEntry, TeamDashboardSummaryOut
from ..services.competitions import list_team_memberships
from ..services.records import compute_team_record
from ..services.team_logos import effective_team_logo_url
from .availability import list_availability
from .events import list_events
from .ice_booking_requests import ICE_BOOKING_REQUEST_LIST_OPTIONS, _request_out
from .proposals import PROPOSAL_LIST_OPTIONS, _proposal_out

router = APIRouter(tags=["dashboard"])


def _record_entry(db: Session, team: Team, games: list[Event]) -> StandingsEntry:
    wins, losses, ties = compute_team_record(team.id, games)
    games_played = wins + losses + ties
    association = team.association or db.get(Association, team.association_id)
    return StandingsEntry(
        team_id=team.id,
        team_name=team.name,
        logo_url=effective_team_logo_url(team, association),
        association_name=association.name if association else None,
        age_group=team.age_group,
        level=team.level,
        wins=wins,
        losses=losses,
        ties=ties,
        points=2 * wins + ties,
        games_played=games_played,
    )


def _team_season_record(db: Session, team: Team, season: Season) -> StandingsEntry:
    games = (
        db.query(Event)
        .filter(
            or_(Event.home_team_id == team.id, Event.away_team_id == team.id),
            Event.event_type == "league",
            Event.status == "final",
            Event.home_score.isnot(None),
            Event.away_score.isnot(None),
            Event.date >= season.start_date,
            Event.date <= season.end_date,
        )
        .all()
    )
    return _record_entry(db, team, games)


def _team_division_record(db: Session, team: Team, division_id: str) -> StandingsEntry:
    games = (
        db.query(Event)
        .filter(
            Event.competition_division_id == division_id,
            Event.counts_for_standings == True,  # noqa: E712
            Event.status == "final",
            Event.home_score.isnot(None),
            Event.away_score.isnot(None),
            or_(Event.home_team_id == team.id, Event.away_team_id == team.id),
        )
        .all()
    )
    return _record_entry(db, team, games)


def _incoming_proposals(db: Session, team_id: str):
    proposals = (
        db.query(Proposal)
        .options(*PROPOSAL_LIST_OPTIONS)
        .filter(
            ((Proposal.home_team_id == team_id) | (Proposal.away_team_id == team_id)),
            Proposal.proposed_by_team_id != team_id,
            Proposal.status == "proposed",
        )
        .order_by(Proposal.proposed_date.asc(), Proposal.proposed_start_time.asc())
        .limit(100)
        .all()
    )
    return [_proposal_out(proposal, db) for proposal in proposals]


def _requested_booking_requests(db: Session, team_id: str):
    requests = (
        db.query(IceBookingRequest)
        .options(*ICE_BOOKING_REQUEST_LIST_OPTIONS)
        .filter(IceBookingRequest.requester_team_id == team_id, IceBookingRequest.status == "requested")
        .order_by(IceBookingRequest.created_at.desc())
        .limit(100)
        .all()
    )
    return [_request_out(request_row, db) for request_row in requests]


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
        _incoming_proposals(db, team_id)
        if can_manage_proposals
        else []
    )
    booking_requests = (
        _requested_booking_requests(db, team_id)
        if can_manage_schedule
        else []
    )

    record = None
    competition_record = None
    primary_membership = None
    if season_id and not family_mode:
        season = db.get(Season, season_id)
        if season:
            record = _team_season_record(db, team, season)

        memberships = list_team_memberships(db, team_id, season_id)
        primary_membership = next((membership for membership in memberships if membership.is_primary), None) or (memberships[0] if memberships else None)
        standings_membership = (
            next((membership for membership in memberships if membership.is_primary and membership.standings_enabled), None)
            or next((membership for membership in memberships if membership.standings_enabled), None)
        )
        if standings_membership:
            competition_record = _team_division_record(db, team, standings_membership.competition_division_id)

    return TeamDashboardSummaryOut(
        availability=availability,
        events=events,
        proposals=proposals,
        booking_requests=booking_requests,
        record=record,
        competition_record=competition_record,
        primary_membership=primary_membership,
    )
