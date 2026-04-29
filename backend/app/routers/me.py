from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.context import enforced_authorization_context
from ..auth.dependencies import current_me_user
from ..database import get_db
from ..models import Team
from ..schemas import (
    AccessibleTeamOut,
    LinkedPlayerOut,
    MeOut,
)

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=MeOut)
def get_me(user=Depends(current_me_user), db: Session = Depends(get_db)):
    if user.access_state == "disabled" or user.auth_state == "disabled":
        return MeOut(
            user=user,
            capabilities=[],
            associations=[],
            teams=[],
            arenas=[],
            linked_players=[],
            accessible_teams=[],
        )

    context = enforced_authorization_context(db, user)
    accessible_team_ids = set(context.team_ids)
    if context.association_memberships:
        accessible_team_ids.update(
            team.id
            for team in db.query(Team).filter(Team.association_id.in_(context.association_ids)).all()
        )

    linked_players: list[LinkedPlayerOut] = []
    for guardianship in context.guardianships:
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
    for membership in context.player_memberships:
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

    if context.user.is_platform_admin:
        accessible_teams = db.query(Team).order_by(Team.name).all()
    elif accessible_team_ids:
        accessible_teams = db.query(Team).filter(Team.id.in_(accessible_team_ids)).order_by(Team.name).all()
    else:
        accessible_teams = []

    return MeOut(
        user=context.user,
        capabilities=sorted(context.capabilities),
        associations=[
            {"association_id": membership.association_id, "role": membership.role}
            for membership in context.association_memberships
        ],
        teams=[
            {"team_id": membership.team_id, "role": membership.role}
            for membership in context.team_memberships
        ],
        arenas=[
            {"arena_id": membership.arena_id, "role": membership.role}
            for membership in context.arena_memberships
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
