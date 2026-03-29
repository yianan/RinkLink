from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.capabilities import ALL_CAPABILITIES, effective_capabilities
from ..auth.dependencies import require_active_user
from ..database import get_db
from ..models import (
    AppUser,
    AssociationMembership,
    ArenaMembership,
    PlayerGuardianship,
    PlayerMembership,
    Team,
    TeamMembership,
)
from ..schemas import (
    AccessibleTeamOut,
    AppUserOut,
    ArenaMembershipOut,
    AssociationMembershipOut,
    LinkedPlayerOut,
    MeOut,
    TeamMembershipOut,
)

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=MeOut)
def get_me(user: AppUser = Depends(require_active_user), db: Session = Depends(get_db)):
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
    guardianships = (
        db.query(PlayerGuardianship)
        .filter(PlayerGuardianship.user_id == user.id)
        .all()
    )
    player_memberships = (
        db.query(PlayerMembership)
        .filter(PlayerMembership.user_id == user.id)
        .all()
    )

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

    accessible_team_ids = {membership.team_id for membership in team_memberships}
    if association_memberships:
        association_ids = [membership.association_id for membership in association_memberships]
        accessible_team_ids.update(
            team.id
            for team in db.query(Team).filter(Team.association_id.in_(association_ids)).all()
        )

    linked_players: list[LinkedPlayerOut] = []
    for guardianship in guardianships:
        player = guardianship.player
        if player:
            accessible_team_ids.add(player.team_id)
            linked_players.append(
                LinkedPlayerOut(
                    player_id=player.id,
                    team_id=player.team_id,
                    season_id=player.season_id,
                    first_name=player.first_name,
                    last_name=player.last_name,
                    link_type=guardianship.relationship_type or "guardian",
                )
            )
    for membership in player_memberships:
        player = membership.player
        if player:
            accessible_team_ids.add(player.team_id)
            linked_players.append(
                LinkedPlayerOut(
                    player_id=player.id,
                    team_id=player.team_id,
                    season_id=player.season_id,
                    first_name=player.first_name,
                    last_name=player.last_name,
                    link_type="player",
                )
            )

    if user.is_platform_admin:
        accessible_teams = db.query(Team).order_by(Team.name).all()
    elif accessible_team_ids:
        accessible_teams = db.query(Team).filter(Team.id.in_(accessible_team_ids)).order_by(Team.name).all()
    else:
        accessible_teams = []

    return MeOut(
        user=AppUserOut.model_validate(user),
        capabilities=sorted(capabilities),
        associations=[
            AssociationMembershipOut(association_id=membership.association_id, role=membership.role)
            for membership in association_memberships
        ],
        teams=[
            TeamMembershipOut(team_id=membership.team_id, role=membership.role)
            for membership in team_memberships
        ],
        arenas=[
            ArenaMembershipOut(arena_id=membership.arena_id, role=membership.role)
            for membership in arena_memberships
        ],
        linked_players=sorted(linked_players, key=lambda player: (player.last_name, player.first_name, player.player_id)),
        accessible_teams=[
            AccessibleTeamOut(
                id=team.id,
                association_id=team.association_id,
                name=team.name,
                age_group=team.age_group,
                level=team.level,
            )
            for team in accessible_teams
        ],
    )
