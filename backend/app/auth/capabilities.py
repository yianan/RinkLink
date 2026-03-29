from __future__ import annotations

from collections.abc import Iterable

from ..models.auth import AppUser

ALL_CAPABILITIES = {
    "platform.manage",
    "association.view",
    "association.manage",
    "team.view",
    "team.manage",
    "team.manage_roster",
    "team.manage_schedule",
    "team.manage_attendance",
    "team.manage_scoresheet",
    "team.manage_proposals",
    "team.manage_staff",
    "team.view_private",
    "arena.view",
    "arena.manage",
    "arena.manage_slots",
    "arena.manage_booking_requests",
    "player.respond_self",
    "player.respond_guarded",
}

ROLE_CAPABILITIES: dict[str, set[str]] = {
    "association_admin": {
        "association.view",
        "association.manage",
        "team.view",
        "team.manage",
        "team.manage_roster",
        "team.manage_schedule",
        "team.manage_attendance",
        "team.manage_scoresheet",
        "team.manage_proposals",
        "team.manage_staff",
        "team.view_private",
        "arena.view",
    },
    "team_admin": {
        "team.view",
        "team.manage",
        "team.manage_roster",
        "team.manage_schedule",
        "team.manage_attendance",
        "team.manage_scoresheet",
        "team.manage_proposals",
        "team.manage_staff",
        "team.view_private",
        "arena.view",
    },
    "manager": {
        "team.view",
        "team.manage_roster",
        "team.manage_schedule",
        "team.manage_attendance",
        "team.manage_scoresheet",
        "team.manage_proposals",
        "team.view_private",
        "arena.view",
    },
    "scheduler": {
        "team.view",
        "team.manage_schedule",
        "team.manage_proposals",
        "team.view_private",
        "arena.view",
    },
    "coach": {
        "team.view",
        "team.manage_attendance",
        "team.manage_scoresheet",
        "team.view_private",
    },
    "arena_admin": {
        "arena.view",
        "arena.manage",
        "arena.manage_slots",
        "arena.manage_booking_requests",
    },
    "arena_ops": {
        "arena.view",
        "arena.manage_slots",
        "arena.manage_booking_requests",
    },
}


def capabilities_for_roles(roles: Iterable[str]) -> set[str]:
    capabilities: set[str] = set()
    for role in roles:
        capabilities.update(ROLE_CAPABILITIES.get(role, set()))
    return capabilities


def effective_capabilities(
    *,
    user: AppUser,
    association_roles: Iterable[str],
    team_roles: Iterable[str],
    arena_roles: Iterable[str],
    has_guardian_link: bool,
    has_player_link: bool,
) -> set[str]:
    if user.is_platform_admin:
        return set(ALL_CAPABILITIES)

    capabilities = set()
    capabilities.update(capabilities_for_roles(association_roles))
    capabilities.update(capabilities_for_roles(team_roles))
    capabilities.update(capabilities_for_roles(arena_roles))
    if has_guardian_link:
        capabilities.add("player.respond_guarded")
    if has_player_link:
        capabilities.add("player.respond_self")
    return capabilities
