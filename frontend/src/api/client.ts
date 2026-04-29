import { authEnabled, clearApiAccessToken, getApiAccessToken } from '../lib/auth-client';

const apiOrigin = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const BASE_URL = apiOrigin ? `${apiOrigin}/api` : '/api';

async function fetchWithAuth(path: string, options?: RequestInit, retryOnUnauthorized = true): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (authEnabled) {
    const token = await getApiAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const revokedResponse = response.status === 403 ? await response.clone().text() : '';
  if ((response.status === 401 || (response.status === 403 && revokedResponse.includes('Access has been revoked'))) && authEnabled && retryOnUnauthorized) {
    clearApiAccessToken();
    const refreshedToken = await getApiAccessToken(true);
    if (refreshedToken) {
      const retryHeaders = new Headers(options?.headers);
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      return fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: retryHeaders,
      });
    }
  }

  return response;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetchWithAuth(path, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getMe: () => request<import('../types').MeResponse>('/me'),
  getUsers: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').AppUserIdentity[]>(`/users${qs}`);
  },
  getUserAccessSummary: (userId: string) =>
    request<import('../types').UserAccessSummary>(`/users/${userId}/access-summary`),
  disableAppAccess: (userId: string, reason?: string | null) =>
    request<import('../types').AppUserIdentity>(`/users/${userId}/disable-app-access`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  restoreAppAccess: (userId: string, reason?: string | null) =>
    request<import('../types').AppUserIdentity>(`/users/${userId}/restore-app-access`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  disableAuth: (userId: string, reason?: string | null) =>
    request<import('../types').AppUserIdentity>(`/users/${userId}/disable-auth`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  restoreAuth: (userId: string, reason?: string | null) =>
    request<import('../types').AppUserIdentity>(`/users/${userId}/restore-auth`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  revokeMembership: (kind: string, membershipId: string, reason?: string | null) =>
    request<void>(`/memberships/${kind}/${membershipId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  getBrowseSeasons: () => request<import('../types').PublicSeason[]>('/browse/seasons'),
  getBrowseTeams: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').PublicTeam[]>(`/browse/teams${qs}`);
  },
  getBrowseTeamEvents: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').PublicEvent[]>(`/browse/teams/${teamId}/events${qs}`);
  },
  getBrowseStandings: (seasonId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').StandingsEntry[]>(`/browse/seasons/${seasonId}/standings${qs}`);
  },
  getInvites: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Invite[]>(`/invites${qs}`);
  },
  getInviteByToken: (token: string) => request<import('../types').Invite>(`/invites/by-token/${token}`),
  createInvite: (data: {
    email: string;
    target_type: string;
    target_id: string;
    role?: string | null;
    expires_in_days?: number;
  }) => request<import('../types').Invite>('/invites', { method: 'POST', body: JSON.stringify(data) }),
  acceptInvite: (token: string) => request<import('../types').Invite>(`/invites/${token}/accept`, { method: 'POST' }),
  cancelInvite: (inviteId: string) => request<void>(`/invites/${inviteId}`, { method: 'DELETE' }),
  getAccessRequests: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').AccessRequest[]>(`/access-requests${qs}`);
  },
  getAccessTargets: (params: Record<string, string>) =>
    request<import('../types').AccessTarget[]>(`/access-targets?${new URLSearchParams(params).toString()}`),
  createAccessRequest: (data: { target_type: string; target_id: string; notes?: string | null }) =>
    request<import('../types').AccessRequest>('/access-requests', { method: 'POST', body: JSON.stringify(data) }),
  approveAccessRequest: (requestId: string, role?: string | null) =>
    request<import('../types').AccessRequest>(`/access-requests/${requestId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ role: role ?? null }),
    }),
  rejectAccessRequest: (requestId: string) =>
    request<import('../types').AccessRequest>(`/access-requests/${requestId}/reject`, { method: 'POST' }),
  getAssociations: () => request<import('../types').Association[]>('/associations'),
  createAssociation: (data: Partial<import('../types').Association>) =>
    request<import('../types').Association>('/associations', { method: 'POST', body: JSON.stringify(data) }),
  updateAssociation: (id: string, data: Partial<import('../types').Association>) =>
    request<import('../types').Association>(`/associations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssociation: (id: string) => request<void>(`/associations/${id}`, { method: 'DELETE' }),
  uploadAssociationLogo: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<import('../types').Association>(`/associations/${id}/logo`, formData);
  },
  deleteAssociationLogo: (id: string) =>
    request<import('../types').Association>(`/associations/${id}/logo`, { method: 'DELETE' }),

  getTeams: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Team[]>(`/teams${qs}`);
  },
  getTeam: (id: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Team>(`/teams/${id}${qs}`);
  },
  createTeam: (data: Partial<import('../types').Team>) =>
    request<import('../types').Team>('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: string, data: Partial<import('../types').Team>) =>
    request<import('../types').Team>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeam: (id: string) => request<void>(`/teams/${id}`, { method: 'DELETE' }),
  uploadTeamLogo: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<import('../types').Team>(`/teams/${id}/logo`, formData);
  },
  deleteTeamLogo: (id: string) =>
    request<import('../types').Team>(`/teams/${id}/logo`, { method: 'DELETE' }),

  getTeamVenueAssignments: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').TeamSeasonVenueAssignment[]>(`/teams/${teamId}/venue-assignments${qs}`);
  },
  createTeamVenueAssignment: (teamId: string, data: Partial<import('../types').TeamSeasonVenueAssignment>) =>
    request<import('../types').TeamSeasonVenueAssignment>(`/teams/${teamId}/venue-assignments`, { method: 'POST', body: JSON.stringify(data) }),
  updateTeamVenueAssignment: (id: string, data: Partial<import('../types').TeamSeasonVenueAssignment>) =>
    request<import('../types').TeamSeasonVenueAssignment>(`/venue-assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeamVenueAssignment: (id: string) => request<void>(`/venue-assignments/${id}`, { method: 'DELETE' }),

  getPlayers: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Player[]>(`/teams/${teamId}/players${qs}`);
  },
  createPlayer: (teamId: string, data: Partial<import('../types').Player>) =>
    request<import('../types').Player>(`/teams/${teamId}/players`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlayer: (id: string, data: Partial<import('../types').Player>) =>
    request<import('../types').Player>(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlayer: (id: string) => request<void>(`/players/${id}`, { method: 'DELETE' }),
  uploadRoster: async (teamId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<import('../types').PlayerUploadPreview>(`/teams/${teamId}/players/upload`, formData);
  },
  confirmRosterUpload: (teamId: string, seasonId: string, entries: import('../types').PlayerUploadRow[], replaceExisting: boolean) =>
    request<import('../types').Player[]>(`/teams/${teamId}/players/confirm-upload`, {
      method: 'POST',
      body: JSON.stringify({ season_id: seasonId, entries, replace_existing: replaceExisting }),
    }),

  getAvailability: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').AvailabilityWindow[]>(`/teams/${teamId}/availability${qs}`);
  },
  createAvailability: (teamId: string, data: Partial<import('../types').AvailabilityWindow>) =>
    request<import('../types').AvailabilityWindow>(`/teams/${teamId}/availability`, { method: 'POST', body: JSON.stringify(data) }),
  uploadAvailability: async (teamId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<import('../types').AvailabilityUploadPreview>(`/teams/${teamId}/availability/upload`, formData);
  },
  confirmAvailabilityUpload: (teamId: string, entries: import('../types').AvailabilityUploadRow[]) =>
    request<import('../types').AvailabilityWindow[]>(`/teams/${teamId}/availability/confirm-upload`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),
  updateAvailability: (id: string, data: Partial<import('../types').AvailabilityWindow>) =>
    request<import('../types').AvailabilityWindow>(`/availability-windows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAvailability: (id: string) => request<void>(`/availability-windows/${id}`, { method: 'DELETE' }),

  searchOpponents: (params: Record<string, string>) =>
    request<import('../types').OpponentResult[]>(`/search/opponents?${new URLSearchParams(params).toString()}`),
  getAutoMatches: (teamId: string) =>
    request<import('../types').AutoMatchResult[]>(`/search/auto-matches?team_id=${teamId}`),

  createProposal: (data: Partial<import('../types').Proposal>) =>
    request<import('../types').Proposal>('/proposals', { method: 'POST', body: JSON.stringify(data) }),
  getProposals: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Proposal[]>(`/teams/${teamId}/proposals${qs}`);
  },
  acceptProposal: (id: string) => request<import('../types').Proposal>(`/proposals/${id}/accept`, { method: 'PATCH' }),
  declineProposal: (id: string) => request<import('../types').Proposal>(`/proposals/${id}/decline`, { method: 'PATCH' }),
  cancelProposal: (id: string) => request<import('../types').Proposal>(`/proposals/${id}/cancel`, { method: 'PATCH' }),
  rescheduleProposal: (id: string, data: Partial<import('../types').Proposal>) =>
    request<import('../types').Proposal>(`/proposals/${id}/reschedule`, { method: 'POST', body: JSON.stringify(data) }),

  getTeamIceBookingRequests: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').IceBookingRequest[]>(`/teams/${teamId}/ice-booking-requests${qs}`);
  },
  createTeamIceBookingRequest: (teamId: string, data: Partial<import('../types').IceBookingRequest>) =>
    request<import('../types').IceBookingRequest>(`/teams/${teamId}/ice-booking-requests`, { method: 'POST', body: JSON.stringify(data) }),
  cancelTeamIceBookingRequest: (teamId: string, requestId: string, responseMessage?: string) =>
    request<import('../types').IceBookingRequest>(`/teams/${teamId}/ice-booking-requests/${requestId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ response_message: responseMessage || null }),
    }),
  getArenaIceBookingRequests: (arenaId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').IceBookingRequest[]>(`/arenas/${arenaId}/ice-booking-requests${qs}`);
  },
  acceptArenaIceBookingRequest: (
    arenaId: string,
    requestId: string,
    data: {
      home_locker_room_id?: string | null;
      away_locker_room_id?: string | null;
      final_price_amount_cents?: number | null;
      final_currency?: string | null;
      response_message?: string | null;
    },
  ) =>
    request<import('../types').IceBookingRequest>(`/arenas/${arenaId}/ice-booking-requests/${requestId}/accept`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  rejectArenaIceBookingRequest: (arenaId: string, requestId: string, responseMessage?: string) =>
    request<import('../types').IceBookingRequest>(`/arenas/${arenaId}/ice-booking-requests/${requestId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ response_message: responseMessage || null }),
    }),
  cancelArenaIceBookingRequest: (arenaId: string, requestId: string, responseMessage?: string) =>
    request<import('../types').IceBookingRequest>(`/arenas/${arenaId}/ice-booking-requests/${requestId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ response_message: responseMessage || null }),
    }),

  getEvents: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Event[]>(`/teams/${teamId}/events${qs}`);
  },
  getArenaEvents: (arenaId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Event[]>(`/arenas/${arenaId}/events${qs}`);
  },
  getArenaIceSlots: (arenaId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').IceSlot[]>(`/arenas/${arenaId}/ice-slots${qs}`);
  },
  getEvent: (id: string) => request<import('../types').Event>(`/events/${id}`),
  getEventAttendance: (teamId: string, eventId: string) =>
    request<import('../types').EventAttendancePlayer[]>(`/teams/${teamId}/events/${eventId}/attendance`),
  updateEventAttendance: (teamId: string, eventId: string, updates: { player_id: string; status: import('../types').AttendanceStatus }[]) =>
    request<import('../types').EventAttendancePlayer[]>(`/teams/${teamId}/events/${eventId}/attendance`, {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    }),
  updateEvent: (id: string, data: Partial<import('../types').Event>) =>
    request<import('../types').Event>(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateEventLockerRooms: (
    id: string,
    data: {
      home_locker_room_id?: string | null;
      away_locker_room_id?: string | null;
      response_message?: string | null;
    },
  ) => request<import('../types').Event>(`/events/${id}/locker-rooms`, { method: 'PATCH', body: JSON.stringify(data) }),
  confirmEvent: (id: string, teamId: string, confirmed: boolean) =>
    request<import('../types').Event>(`/events/${id}/weekly-confirm`, { method: 'PATCH', body: JSON.stringify({ team_id: teamId, confirmed }) }),
  cancelEvent: (id: string) => request<import('../types').Event>(`/events/${id}/cancel`, { method: 'PATCH' }),

  getEventScoresheet: (eventId: string) => request<import('../types').EventScoresheet>(`/events/${eventId}/scoresheet`),
  upsertPlayerStats: (eventId: string, stats: import('../types').EventPlayerStatUpsert[]) =>
    request<import('../types').EventPlayerStat[]>(`/events/${eventId}/player-stats`, { method: 'PUT', body: JSON.stringify({ stats }) }),
  listPenalties: (eventId: string) => request<import('../types').EventPenalty[]>(`/events/${eventId}/penalties`),
  createPenalty: (eventId: string, data: Partial<import('../types').EventPenalty>) =>
    request<import('../types').EventPenalty>(`/events/${eventId}/penalties`, { method: 'POST', body: JSON.stringify(data) }),
  deletePenalty: (id: string) => request<void>(`/event-penalties/${id}`, { method: 'DELETE' }),
  upsertGoalieStats: (eventId: string, stats: import('../types').EventGoalieStatUpsert[]) =>
    request<import('../types').EventGoalieStat[]>(`/events/${eventId}/goalie-stats`, { method: 'PUT', body: JSON.stringify({ stats }) }),
  listSignatures: (eventId: string) => request<import('../types').EventSignature[]>(`/events/${eventId}/signatures`),
  signEvent: (eventId: string, data: Partial<import('../types').EventSignature>) =>
    request<import('../types').EventSignature>(`/events/${eventId}/signatures`, { method: 'POST', body: JSON.stringify(data) }),

  getNotifications: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Notification[]>(`/teams/${teamId}/notifications${qs}`);
  },
  markNotificationRead: (id: string) =>
    request<import('../types').Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),

  getArenas: () => request<import('../types').Arena[]>('/arenas'),
  getArena: (id: string) => request<import('../types').Arena>(`/arenas/${id}`),
  createArena: (data: Partial<import('../types').Arena>) =>
    request<import('../types').Arena>('/arenas', { method: 'POST', body: JSON.stringify(data) }),
  updateArena: (id: string, data: Partial<import('../types').Arena>) =>
    request<import('../types').Arena>(`/arenas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArena: (id: string) => request<void>(`/arenas/${id}`, { method: 'DELETE' }),
  uploadArenaLogo: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<import('../types').Arena>(`/arenas/${id}/logo`, formData);
  },
  deleteArenaLogo: (id: string) =>
    request<import('../types').Arena>(`/arenas/${id}/logo`, { method: 'DELETE' }),

  getArenaRinks: (arenaId: string) =>
    request<import('../types').ArenaRink[]>(`/arenas/${arenaId}/rinks`),
  getArenaRink: (id: string) => request<import('../types').ArenaRink>(`/arena-rinks/${id}`),
  createArenaRink: (arenaId: string, data: Partial<import('../types').ArenaRink>) =>
    request<import('../types').ArenaRink>(`/arenas/${arenaId}/rinks`, { method: 'POST', body: JSON.stringify(data) }),
  updateArenaRink: (id: string, data: Partial<import('../types').ArenaRink>) =>
    request<import('../types').ArenaRink>(`/arena-rinks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArenaRink: (id: string) => request<void>(`/arena-rinks/${id}`, { method: 'DELETE' }),

  getLockerRooms: (arenaRinkId: string) =>
    request<import('../types').LockerRoom[]>(`/arena-rinks/${arenaRinkId}/locker-rooms`),
  createLockerRoom: (arenaRinkId: string, data: Partial<import('../types').LockerRoom>) =>
    request<import('../types').LockerRoom>(`/arena-rinks/${arenaRinkId}/locker-rooms`, { method: 'POST', body: JSON.stringify(data) }),
  updateLockerRoom: (id: string, data: Partial<import('../types').LockerRoom>) =>
    request<import('../types').LockerRoom>(`/locker-rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLockerRoom: (id: string) => request<void>(`/locker-rooms/${id}`, { method: 'DELETE' }),

  getIceSlots: (arenaRinkId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').IceSlot[]>(`/arena-rinks/${arenaRinkId}/ice-slots${qs}`);
  },
  createIceSlot: (arenaRinkId: string, data: Partial<import('../types').IceSlot>) =>
    request<import('../types').IceSlot>(`/arena-rinks/${arenaRinkId}/ice-slots`, { method: 'POST', body: JSON.stringify(data) }),
  uploadIceSlots: async (arenaRinkId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<import('../types').IceSlotUploadPreview>(`/arena-rinks/${arenaRinkId}/ice-slots/upload`, formData);
  },
  confirmIceSlotUpload: (arenaRinkId: string, entries: import('../types').IceSlotUploadRow[]) =>
    request<import('../types').IceSlot[]>(`/arena-rinks/${arenaRinkId}/ice-slots/confirm-upload`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),
  getAvailableIceSlots: (arenaRinkId: string, date: string) =>
    request<import('../types').IceSlot[]>(`/arena-rinks/${arenaRinkId}/available-ice-slots?date=${date}`),
  getOpenIceSlots: (params: Record<string, string>) =>
    request<import('../types').IceSlot[]>(`/ice-slots/open?${new URLSearchParams(params).toString()}`),
  updateIceSlot: (id: string, data: Partial<import('../types').IceSlot>) =>
    request<import('../types').IceSlot>(`/ice-slots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIceSlot: (id: string) => request<void>(`/ice-slots/${id}`, { method: 'DELETE' }),
  cancelArenaIceSlot: (arenaId: string, id: string, responseMessage?: string) =>
    request<void>(`/arenas/${arenaId}/ice-slots/${id}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ response_message: responseMessage || null }),
    }),
  updateArenaIceSlotLockerRooms: (
    arenaId: string,
    id: string,
    data: {
      home_locker_room_id?: string | null;
      away_locker_room_id?: string | null;
      response_message?: string | null;
    },
  ) => request<void>(`/arenas/${arenaId}/ice-slots/${id}/locker-rooms`, { method: 'PATCH', body: JSON.stringify(data) }),
  getArenaVenueAssignments: (arenaId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').TeamSeasonVenueAssignment[]>(`/arenas/${arenaId}/venue-assignments${qs}`);
  },

  getSeasons: () => request<import('../types').Season[]>('/seasons'),
  getSeason: (id: string) => request<import('../types').Season>(`/seasons/${id}`),
  getStandings: (seasonId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').StandingsEntry[]>(`/seasons/${seasonId}/standings${qs}`);
  },

  getCompetitions: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Competition[]>(`/competitions${qs}`);
  },
  getCompetitionDivisions: (params: Record<string, string>) =>
    request<import('../types').CompetitionDivision[]>(`/competition-divisions?${new URLSearchParams(params).toString()}`),
  getCompetitionDivisionStandings: (divisionId: string) =>
    request<import('../types').StandingsEntry[]>(`/competition-divisions/${divisionId}/standings`),
  getTeamCompetitionMemberships: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').TeamCompetitionMembership[]>(`/teams/${teamId}/competition-memberships${qs}`);
  },

  seed: () => request<{ message: string }>('/seed', { method: 'POST' }),
};
