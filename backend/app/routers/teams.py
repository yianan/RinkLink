from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from ..auth.context import AuthorizationContext, authorization_context, ensure_association_access, ensure_team_access
from ..database import get_db
from ..models import Arena, ArenaRink, Association, LockerRoom, Team, TeamSeasonVenueAssignment
from ..schemas import (
    TeamCreate,
    TeamSeasonVenueAssignmentCreate,
    TeamSeasonVenueAssignmentOut,
    TeamSeasonVenueAssignmentUpdate,
    TeamOut,
    TeamUpdate,
)
from ..services.competitions import memberships_for_teams
from ..services.team_logos import delete_logo_if_unused, effective_team_logo_url, save_team_logo_upload, team_logo_response

router = APIRouter(tags=["teams"])


def _enrich(team: Team, db: Session, memberships_by_team: dict[str, list] | None = None) -> TeamOut:
    assoc = db.get(Association, team.association_id)
    out = TeamOut.model_validate(team)
    out.logo_url = effective_team_logo_url(team, assoc)
    out.association_name = assoc.name if assoc else None
    memberships = (memberships_by_team or {}).get(team.id, [])
    out.memberships = memberships
    out.primary_membership = memberships[0] if memberships else None
    return out


@router.get("/team-logos/{filename}", include_in_schema=False)
def get_team_logo(filename: str, db: Session = Depends(get_db)):
    return team_logo_response(db, filename)


def _venue_assignment_out(assignment: TeamSeasonVenueAssignment) -> TeamSeasonVenueAssignmentOut:
    out = TeamSeasonVenueAssignmentOut.model_validate(assignment)
    out.team_name = assignment.team.name if assignment.team else None
    out.arena_name = assignment.arena.name if assignment.arena else None
    out.arena_rink_name = assignment.arena_rink.name if assignment.arena_rink else None
    out.default_locker_room_name = assignment.default_locker_room.name if assignment.default_locker_room else None
    return out


def _validate_assignment_venue(db: Session, *, arena_id: str, arena_rink_id: str, locker_room_id: str | None):
    arena = db.get(Arena, arena_id)
    if not arena:
        raise HTTPException(404, "Arena not found")
    arena_rink = db.get(ArenaRink, arena_rink_id)
    if not arena_rink or arena_rink.arena_id != arena.id:
        raise HTTPException(400, "Arena rink does not belong to arena")
    if locker_room_id:
        locker_room = db.get(LockerRoom, locker_room_id)
        if not locker_room or locker_room.arena_rink_id != arena_rink.id:
            raise HTTPException(400, "Locker room does not belong to arena rink")


def _scoped_teams_query(db: Session, context: AuthorizationContext):
    if context.user.is_platform_admin:
        return db.query(Team)
    if "team.view" not in context.capabilities:
        return db.query(Team).filter(False)
    if context.association_ids or context.team_ids:
        return db.query(Team).filter((Team.association_id.in_(context.association_ids)) | (Team.id.in_(context.team_ids)))
    return db.query(Team).filter(False)


def list_scoped_teams_out(
    context: AuthorizationContext,
    db: Session,
    season_id: str | None = None,
) -> list[TeamOut]:
    teams = _scoped_teams_query(db, context).order_by(Team.name).all()
    memberships_by_team = memberships_for_teams(db, [team.id for team in teams], season_id)
    return [_enrich(team, db, memberships_by_team) for team in teams]


@router.get("/teams", response_model=list[TeamOut])
def list_teams(
    association_id: str | None = Query(None),
    age_group: str | None = Query(None),
    level: str | None = Query(None),
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    q = _scoped_teams_query(db, context)
    if association_id:
        q = q.filter(Team.association_id == association_id)
    if age_group:
        q = q.filter(Team.age_group == age_group)
    if level:
        q = q.filter(Team.level == level)
    teams = q.order_by(Team.name).all()
    memberships_by_team = memberships_for_teams(db, [team.id for team in teams], season_id)
    return [_enrich(t, db, memberships_by_team) for t in teams]


@router.post("/teams", response_model=TeamOut, status_code=201)
def create_team(
    body: TeamCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    if not db.get(Association, body.association_id):
        raise HTTPException(400, "Association not found")
    ensure_association_access(context, body.association_id, "association.manage")
    team = Team(**body.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    return _enrich(team, db, {})


@router.get("/teams/{id}", response_model=TeamOut)
def get_team(
    id: str,
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.view")
    memberships_by_team = memberships_for_teams(db, [team.id], season_id)
    return _enrich(team, db, memberships_by_team)


@router.put("/teams/{id}", response_model=TeamOut)
def update_team(
    id: str,
    body: TeamUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(team, k, v)
    db.commit()
    db.refresh(team)
    return _enrich(team, db, {})


@router.post("/teams/{id}/logo", response_model=TeamOut)
async def upload_team_logo(
    id: str,
    file: UploadFile = File(...),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage")
    previous_logo_asset_id = team.logo_asset_id
    team.logo_asset_id = await save_team_logo_upload(db, id, file)
    team.logo_path = None
    db.commit()
    db.refresh(team)
    delete_logo_if_unused(db, previous_logo_asset_id, ignore_team_id=team.id)
    return _enrich(team, db, {})


@router.delete("/teams/{id}/logo", response_model=TeamOut)
def delete_team_logo(
    id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage")
    previous_logo_asset_id = team.logo_asset_id
    team.logo_asset_id = None
    team.logo_path = None
    db.commit()
    db.refresh(team)
    delete_logo_if_unused(db, previous_logo_asset_id, ignore_team_id=team.id)
    return _enrich(team, db, {})


@router.delete("/teams/{id}", status_code=204)
def delete_team(
    id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_association_access(context, team.association_id, "association.manage")
    db.delete(team)
    db.commit()


@router.get("/teams/{team_id}/venue-assignments", response_model=list[TeamSeasonVenueAssignmentOut])
def list_team_venue_assignments(
    team_id: str,
    season_id: str | None = Query(None),
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.view")
    query = db.query(TeamSeasonVenueAssignment).filter(TeamSeasonVenueAssignment.team_id == team_id)
    if season_id:
        query = query.filter(TeamSeasonVenueAssignment.season_id == season_id)
    return [_venue_assignment_out(assignment) for assignment in query.order_by(TeamSeasonVenueAssignment.created_at).all()]


@router.post("/teams/{team_id}/venue-assignments", response_model=TeamSeasonVenueAssignmentOut, status_code=201)
def create_team_venue_assignment(
    team_id: str,
    body: TeamSeasonVenueAssignmentCreate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, team, "team.manage_schedule")
    _validate_assignment_venue(
        db,
        arena_id=body.arena_id,
        arena_rink_id=body.arena_rink_id,
        locker_room_id=body.default_locker_room_id,
    )
    assignment = (
        db.query(TeamSeasonVenueAssignment)
        .filter(
            TeamSeasonVenueAssignment.team_id == team_id,
            TeamSeasonVenueAssignment.season_id == body.season_id,
        )
        .first()
    )
    if assignment:
        assignment.arena_id = body.arena_id
        assignment.arena_rink_id = body.arena_rink_id
        assignment.default_locker_room_id = body.default_locker_room_id
    else:
        assignment = TeamSeasonVenueAssignment(team_id=team_id, **body.model_dump())
        db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _venue_assignment_out(assignment)


@router.put("/venue-assignments/{assignment_id}", response_model=TeamSeasonVenueAssignmentOut)
def update_team_venue_assignment(
    assignment_id: str,
    body: TeamSeasonVenueAssignmentUpdate,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    assignment = db.get(TeamSeasonVenueAssignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Venue assignment not found")
    if not assignment.team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, assignment.team, "team.manage_schedule")
    arena_id = body.arena_id or assignment.arena_id
    arena_rink_id = body.arena_rink_id or assignment.arena_rink_id
    locker_room_id = body.default_locker_room_id if "default_locker_room_id" in body.model_fields_set else assignment.default_locker_room_id
    _validate_assignment_venue(
        db,
        arena_id=arena_id,
        arena_rink_id=arena_rink_id,
        locker_room_id=locker_room_id,
    )
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(assignment, key, value)
    db.commit()
    db.refresh(assignment)
    return _venue_assignment_out(assignment)


@router.delete("/venue-assignments/{assignment_id}", status_code=204)
def delete_team_venue_assignment(
    assignment_id: str,
    context: AuthorizationContext = Depends(authorization_context),
    db: Session = Depends(get_db),
):
    assignment = db.get(TeamSeasonVenueAssignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Venue assignment not found")
    if not assignment.team:
        raise HTTPException(404, "Team not found")
    ensure_team_access(context, assignment.team, "team.manage_schedule")
    db.delete(assignment)
    db.commit()
