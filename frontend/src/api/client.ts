const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getAssociations: () => request<import('../types').Association[]>('/associations'),
  createAssociation: (data: Partial<import('../types').Association>) =>
    request<import('../types').Association>('/associations', { method: 'POST', body: JSON.stringify(data) }),
  updateAssociation: (id: string, data: Partial<import('../types').Association>) =>
    request<import('../types').Association>(`/associations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssociation: (id: string) => request<void>(`/associations/${id}`, { method: 'DELETE' }),
  uploadAssociationLogo: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/associations/${id}/logo`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').Association>;
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
    const res = await fetch(`${BASE_URL}/teams/${id}/logo`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').Team>;
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
    const res = await fetch(`${BASE_URL}/teams/${teamId}/players/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').PlayerUploadPreview>;
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
    const res = await fetch(`${BASE_URL}/teams/${teamId}/availability/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').AvailabilityUploadPreview>;
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

  getEvents: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return request<import('../types').Event[]>(`/teams/${teamId}/events${qs}`);
  },
  createEvent: (teamId: string, data: Partial<import('../types').Event>) =>
    request<import('../types').Event>(`/teams/${teamId}/events`, { method: 'POST', body: JSON.stringify(data) }),
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
    const res = await fetch(`${BASE_URL}/arenas/${id}/logo`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').Arena>;
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
    const res = await fetch(`${BASE_URL}/arena-rinks/${arenaRinkId}/ice-slots/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').IceSlotUploadPreview>;
  },
  confirmIceSlotUpload: (arenaRinkId: string, entries: import('../types').IceSlotUploadRow[]) =>
    request<import('../types').IceSlot[]>(`/arena-rinks/${arenaRinkId}/ice-slots/confirm-upload`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),
  getAvailableIceSlots: (arenaRinkId: string, date: string) =>
    request<import('../types').IceSlot[]>(`/arena-rinks/${arenaRinkId}/available-ice-slots?date=${date}`),
  updateIceSlot: (id: string, data: Partial<import('../types').IceSlot>) =>
    request<import('../types').IceSlot>(`/ice-slots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIceSlot: (id: string) => request<void>(`/ice-slots/${id}`, { method: 'DELETE' }),
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
