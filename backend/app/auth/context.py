from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    AppUser,
    AssociationMembership,
    ArenaMembership,
    Event,
    PlayerGuardianship,
    PlayerMembership,
    Proposal,
    Team,
    TeamMembership,
)
from .capabilities import ALL_CAPABILITIES, effective_capabilities
from .dependencies import require_active_user


@dataclass(slots=True)
class AuthorizationContext:
    user: AppUser
    association_memberships: list[AssociationMembership]
    team_memberships: list[TeamMembership]
    arena_memberships: list[ArenaMembership]
    guardianships: list[PlayerGuardianship]
    player_memberships: list[PlayerMembership]
    capabilities: set[str]
    association_ids: set[str]
    team_ids: set[str]
    arena_ids: set[str]
    guardian_player_ids: set[str]
    player_ids: set[str]
    linked_team_ids: set[str]


def build_authorization_context(db: Session, user: AppUser) -> AuthorizationContext:
    association_memberships = (
        db.query(AssociationMembership)
        .filter(AssociationMembership.user_id == user.id)
        .order_by(AssociationMembership.association_id)
        .all()
    )
    team_memberships = (
        db.query(TeamMembership)
        .filter(TeamMembership.user_id == user.id)
        .order_by(TeamMembership.team_id)
        .all()
    )
    arena_memberships = (
        db.query(ArenaMembership)
        .filter(ArenaMembership.user_id == user.id)
        .order_by(ArenaMembership.arena_id)
        .all()
    )
    guardianships = db.query(PlayerGuardianship).filter(PlayerGuardianship.user_id == user.id).all()
    player_memberships = db.query(PlayerMembership).filter(PlayerMembership.user_id == user.id).all()

    capabilities = (
        set(ALL_CAPABILITIES)
        if user.is_platform_admin
        else effective_capabilities(
            user=user,
            association_roles=[membership.role for membership in association_memberships],
            team_roles=[membership.role for membership in team_memberships],
            arena_roles=[membership.role for membership in arena_memberships],
            has_guardian_link=bool(guardianships),
            has_player_link=bool(player_memberships),
        )
    )

    association_ids = {membership.association_id for membership in association_memberships}
    team_ids = {membership.team_id for membership in team_memberships}
    arena_ids = {membership.arena_id for membership in arena_memberships}
    guardian_player_ids = {guardianship.player_id for guardianship in guardianships}
    player_ids = {membership.player_id for membership in player_memberships}

    linked_team_ids: set[str] = set()
    for guardianship in guardianships:
        if guardianship.player:
            linked_team_ids.add(guardianship.player.team_id)
    for membership in player_memberships:
        if membership.player:
            linked_team_ids.add(membership.player.team_id)

    return AuthorizationContext(
        user=user,
        association_memberships=association_memberships,
        team_memberships=team_memberships,
        arena_memberships=arena_memberships,
        guardianships=guardianships,
        player_memberships=player_memberships,
        capabilities=capabilities,
        association_ids=association_ids,
        team_ids=team_ids,
        arena_ids=arena_ids,
        guardian_player_ids=guardian_player_ids,
        player_ids=player_ids,
        linked_team_ids=linked_team_ids,
    )


def authorization_context(
    user: AppUser = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> AuthorizationContext:
    return build_authorization_context(db, user)


def can_access_association(context: AuthorizationContext, association_id: str, capability: str) -> bool:
    if context.user.is_platform_admin:
        return True
    return capability in context.capabilities and association_id in context.association_ids


def can_access_team(
    context: AuthorizationContext,
    team: Team,
    capability: str,
    *,
    allow_linked_family: bool = False,
) -> bool:
    if context.user.is_platform_admin:
        return True
    if capability not in context.capabilities:
        return False
    if team.id in context.team_ids or team.association_id in context.association_ids:
        return True
    if allow_linked_family and team.id in context.linked_team_ids:
        return True
    return False


def can_access_arena(context: AuthorizationContext, arena_id: str, capability: str) -> bool:
    if context.user.is_platform_admin:
        return True
    return capability in context.capabilities and arena_id in context.arena_ids


def can_access_any_event_team(
    context: AuthorizationContext,
    event: Event,
    capability: str,
    *,
    allow_linked_family: bool = False,
) -> bool:
    teams = [team for team in (event.home_team, event.away_team) if team is not None]
    return any(
        can_access_team(context, team, capability, allow_linked_family=allow_linked_family)
        for team in teams
    )


def can_access_any_proposal_team(context: AuthorizationContext, proposal: Proposal, capability: str) -> bool:
    teams = [team for team in (proposal.home_team, proposal.away_team) if team is not None]
    return any(can_access_team(context, team, capability) for team in teams)


def can_access_proposal_counterparty(context: AuthorizationContext, proposal: Proposal, capability: str) -> bool:
    teams = [
        team
        for team in (proposal.home_team, proposal.away_team)
        if team is not None and team.id != proposal.proposed_by_team_id
    ]
    return any(can_access_team(context, team, capability) for team in teams)


def ensure_association_access(context: AuthorizationContext, association_id: str, capability: str) -> None:
    if can_access_association(context, association_id, capability):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this association")


def ensure_team_access(
    context: AuthorizationContext,
    team: Team,
    capability: str,
    *,
    allow_linked_family: bool = False,
) -> None:
    if can_access_team(context, team, capability, allow_linked_family=allow_linked_family):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this team")


def ensure_arena_access(context: AuthorizationContext, arena_id: str, capability: str) -> None:
    if can_access_arena(context, arena_id, capability):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this arena")


def ensure_event_team_access(
    context: AuthorizationContext,
    event: Event,
    capability: str,
    *,
    allow_linked_family: bool = False,
) -> None:
    if can_access_any_event_team(context, event, capability, allow_linked_family=allow_linked_family):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this event")


def ensure_proposal_team_access(context: AuthorizationContext, proposal: Proposal, capability: str) -> None:
    if can_access_any_proposal_team(context, proposal, capability):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this proposal")


def ensure_proposal_counterparty_access(context: AuthorizationContext, proposal: Proposal, capability: str) -> None:
    if can_access_proposal_counterparty(context, proposal, capability):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to respond to this proposal",
    )
