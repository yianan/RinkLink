const ACCESS_TARGET_TYPE_LABELS: Record<string, string> = {
  association: 'Association Access',
  team: 'Team Staff Access',
  arena: 'Arena Staff Access',
  guardian_link: 'Parent/Guardian Link',
  player_link: 'Player Link',
};

const ACCESS_ROLE_LABELS: Record<string, string> = {
  association_admin: 'Association Admin',
  arena_admin: 'Arena Admin',
  arena_ops: 'Arena Ops',
  coach: 'Coach',
  manager: 'Manager',
  scheduler: 'Scheduler',
  team_admin: 'Team Admin',
};

function titleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getAccessTargetTypeLabel(targetType: string) {
  return ACCESS_TARGET_TYPE_LABELS[targetType] || titleCase(targetType);
}

export function getAccessRoleLabel(role: string) {
  return ACCESS_ROLE_LABELS[role] || titleCase(role);
}
