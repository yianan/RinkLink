from dataclasses import dataclass
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..models import AppUser, TeamMembership
from .capabilities import ALL_CAPABILITIES, capabilities_for_roles
from .dependencies import require_active_user, current_user


@dataclass
class AuthorizationContext:
    user: AppUser
    team_memberships: list
    team_roles: dict
    team_ids: set
    capabilities: set


def build_authorization_context(db, user):
    stored = db.get(AppUser, user.id)
    if stored is not None:
        stored._token_claims = getattr(user, '_token_claims', None)
        user = stored
    memberships = db.query(TeamMembership).filter(TeamMembership.user_id == user.id).all()
    roles = {membership.team_id: membership.role for membership in memberships}
    return AuthorizationContext(user, memberships, roles, set(roles),
        set(ALL_CAPABILITIES) if user.is_platform_admin else capabilities_for_roles(roles.values()))


def enforced_authorization_context(db, user):
    context = build_authorization_context(db, user)
    privileged = user.is_platform_admin or "team.manage_staff" in context.capabilities
    if settings.auth_require_mfa_for_privileged and privileged and not settings.auth_bypass_dev_only:
        if not (getattr(user, "_token_claims", None) or {}).get("mfa_verified"):
            raise HTTPException(403, "Two-factor authentication is required for this account")
    return context


def authorization_context(user=Depends(require_active_user), db: Session = Depends(get_db)):
    return enforced_authorization_context(db, user)


def current_authorization_context(user=Depends(current_user), db: Session = Depends(get_db)):
    return enforced_authorization_context(db, user)


def can_access_team(context, team, capability):
    return context.user.is_platform_admin or capability in capabilities_for_roles([context.team_roles.get(team.id)])


def ensure_team_access(context, team, capability):
    if not can_access_team(context, team, capability):
        raise HTTPException(403, "You do not have access to this team")


def ensure_capability(context, capability):
    if capability not in context.capabilities:
        raise HTTPException(403, "You do not have permission to access this resource")


def ensure_event_team_access(context, event, capability):
    if not any(can_access_team(context, team, capability) for team in [event.home_team, event.away_team] if team):
        raise HTTPException(403, "You do not have access to this event")


def ensure_proposal_team_access(context, proposal, capability):
    if not any(can_access_team(context, team, capability) for team in [proposal.home_team, proposal.away_team] if team):
        raise HTTPException(403, "You do not have access to this proposal")


def ensure_proposal_counterparty_access(context, proposal, capability):
    teams = [team for team in [proposal.home_team, proposal.away_team] if team and team.id != proposal.proposed_by_team_id]
    if not any(can_access_team(context, team, capability) for team in teams):
        raise HTTPException(403, "Only the opposing team can respond to this proposal")
