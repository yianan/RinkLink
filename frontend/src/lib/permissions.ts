import type { MeResponse } from '../types';

export function hasCapability(me: MeResponse | null, capability: string) {
  return !!me?.capabilities.includes(capability);
}

export function hasAnyCapability(me: MeResponse | null, capabilities: string[]) {
  return capabilities.some((capability) => hasCapability(me, capability));
}

export function canViewPrivateRoster(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'team.view_private']);
}

export function canManageRoster(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'team.manage_roster']);
}

export function canManageSchedule(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'team.manage_schedule']);
}

export function canManageProposals(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'team.manage_proposals']);
}

export function canViewTeams(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'team.view', 'association.view']);
}

export function canManageTeams(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'association.manage']);
}

export function canViewAssociations(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'association.view']);
}

export function canManageAssociations(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'association.manage']);
}

export function canViewArenas(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'arena.view']);
}

export function canManageArena(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'arena.manage']);
}

export function canManageArenaSlots(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'arena.manage', 'arena.manage_slots']);
}

export function canManageArenaBookingRequests(me: MeResponse | null) {
  return hasAnyCapability(me, ['platform.manage', 'arena.manage', 'arena.manage_booking_requests']);
}
