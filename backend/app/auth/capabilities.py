ROLE_CAPABILITIES = {
    "team_admin": {"team.view", "team.manage", "team.manage_schedule", "team.manage_proposals", "team.manage_staff"},
    "scheduler": {"team.view", "team.manage_schedule", "team.manage_proposals"},
}
ALL_CAPABILITIES = {"platform.manage", "venue.manage"} | set.union(*ROLE_CAPABILITIES.values())


def capabilities_for_roles(roles):
    return set().union(*(ROLE_CAPABILITIES.get(role, set()) for role in roles))
