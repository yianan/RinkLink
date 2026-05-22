from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, ensure_team_access
from ..database import get_db
from ..models import CompetitionDivision, Team, TeamCompetitionMembership
from ..schemas import CompetitionDivisionOut, CompetitionOut, StandingsEntry, TeamCompetitionMembershipCreate, TeamCompetitionMembershipOut
from ..services.competitions import division_standings, list_competitions, list_divisions, list_team_memberships
from ..services.season_utils import ensure_standard_seasons

router = APIRouter(tags=["competitions"])


@router.get("/competitions", response_model=list[CompetitionOut])
def get_competitions(
    season_id: str | None = Query(None),
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_standard_seasons(db)
    return list_competitions(db, season_id)


@router.get("/competition-divisions", response_model=list[CompetitionDivisionOut])
def get_competition_divisions(
    season_id: str = Query(...),
    standings_enabled: bool | None = Query(None),
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    ensure_standard_seasons(db)
    return list_divisions(db, season_id, standings_enabled=standings_enabled)


@router.get("/teams/{team_id}/competition-memberships", response_model=list[TeamCompetitionMembershipOut])
def get_team_competition_memberships(
    team_id: str,
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.view")
    ensure_standard_seasons(db)
    return list_team_memberships(db, team_id, season_id)


@router.put("/teams/{team_id}/competition-memberships", response_model=list[TeamCompetitionMembershipOut])
def set_team_competition_membership(
    team_id: str,
    body: TeamCompetitionMembershipCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage")
    division = db.get(CompetitionDivision, body.competition_division_id)
    if not division:
        raise HTTPException(404, "Competition division not found")
    if division.season_id != body.season_id:
        raise HTTPException(400, "Competition division does not belong to that season")

    if body.is_primary:
        (
            db.query(TeamCompetitionMembership)
            .filter(
                TeamCompetitionMembership.team_id == team_id,
                TeamCompetitionMembership.season_id == body.season_id,
                TeamCompetitionMembership.is_primary == True,  # noqa: E712
            )
            .update({TeamCompetitionMembership.is_primary: False}, synchronize_session=False)
        )

    membership = (
        db.query(TeamCompetitionMembership)
        .filter(
            TeamCompetitionMembership.team_id == team_id,
            TeamCompetitionMembership.season_id == body.season_id,
            TeamCompetitionMembership.competition_division_id == body.competition_division_id,
        )
        .first()
    )
    if membership is None:
        membership = TeamCompetitionMembership(
            team_id=team_id,
            season_id=body.season_id,
            competition_division_id=body.competition_division_id,
        )
        db.add(membership)

    membership.membership_role = body.membership_role
    membership.is_primary = body.is_primary
    membership.sort_order = body.sort_order
    db.commit()
    return list_team_memberships(db, team_id, body.season_id)


@router.delete("/teams/{team_id}/competition-memberships/{membership_id}", response_model=list[TeamCompetitionMembershipOut])
def delete_team_competition_membership(
    team_id: str,
    membership_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage")
    membership = db.get(TeamCompetitionMembership, membership_id)
    if not membership or membership.team_id != team_id:
        raise HTTPException(404, "Competition membership not found")
    season_id = membership.season_id
    db.delete(membership)
    db.commit()
    return list_team_memberships(db, team_id, season_id)


@router.get("/competition-divisions/{division_id}", response_model=CompetitionDivisionOut)
def get_competition_division(
    division_id: str,
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    division = db.get(CompetitionDivision, division_id)
    if not division:
        raise HTTPException(404, "Competition division not found")
    divisions = list_divisions(db, division.season_id, standings_enabled=None)
    for item in divisions:
        if item.id == division_id:
            return item
    raise HTTPException(404, "Competition division not found")


@router.get("/competition-divisions/{division_id}/standings", response_model=list[StandingsEntry])
def get_competition_division_standings(
    division_id: str,
    _: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    division = db.get(CompetitionDivision, division_id)
    if not division:
        raise HTTPException(404, "Competition division not found")
    return division_standings(db, division_id)
