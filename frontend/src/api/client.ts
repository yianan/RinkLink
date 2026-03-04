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
  // Associations
  getAssociations: () => request<import('../types').Association[]>('/associations'),
  createAssociation: (data: Partial<import('../types').Association>) =>
    request<import('../types').Association>('/associations', { method: 'POST', body: JSON.stringify(data) }),
  updateAssociation: (id: string, data: Partial<import('../types').Association>) =>
    request<import('../types').Association>(`/associations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssociation: (id: string) =>
    request<void>(`/associations/${id}`, { method: 'DELETE' }),

  // Teams
  getTeams: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').Team[]>(`/teams${qs}`);
  },
  getTeam: (id: string) => request<import('../types').Team>(`/teams/${id}`),
  createTeam: (data: Partial<import('../types').Team>) =>
    request<import('../types').Team>('/teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id: string, data: Partial<import('../types').Team>) =>
    request<import('../types').Team>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeam: (id: string) =>
    request<void>(`/teams/${id}`, { method: 'DELETE' }),

  // Players / Roster
  getPlayers: (teamId: string) => request<import('../types').Player[]>(`/teams/${teamId}/players`),
  createPlayer: (teamId: string, data: Partial<import('../types').Player>) =>
    request<import('../types').Player>(`/teams/${teamId}/players`, { method: 'POST', body: JSON.stringify(data) }),
  updatePlayer: (id: string, data: Partial<import('../types').Player>) =>
    request<import('../types').Player>(`/players/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePlayer: (id: string) =>
    request<void>(`/players/${id}`, { method: 'DELETE' }),
  uploadRoster: async (teamId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/teams/${teamId}/players/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').PlayerUploadPreview>;
  },
  confirmRosterUpload: (teamId: string, entries: import('../types').PlayerUploadRow[], replace_existing: boolean) =>
    request<import('../types').Player[]>(`/teams/${teamId}/players/confirm-upload`, {
      method: 'POST', body: JSON.stringify({ entries, replace_existing }),
    }),

  // Schedule
  getSchedule: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').ScheduleEntry[]>(`/teams/${teamId}/schedule${qs}`);
  },
  createScheduleEntry: (teamId: string, data: Partial<import('../types').ScheduleEntry>) =>
    request<import('../types').ScheduleEntry>(`/teams/${teamId}/schedule`, { method: 'POST', body: JSON.stringify(data) }),
  uploadSchedule: async (teamId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/teams/${teamId}/schedule/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').ScheduleUploadPreview>;
  },
  confirmUpload: (teamId: string, entries: import('../types').ScheduleUploadRow[]) =>
    request<import('../types').ScheduleEntry[]>(`/teams/${teamId}/schedule/confirm-upload`, {
      method: 'POST', body: JSON.stringify({ entries }),
    }),
  updateScheduleEntry: (id: string, data: Partial<import('../types').ScheduleEntry>) =>
    request<import('../types').ScheduleEntry>(`/schedule-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteScheduleEntry: (id: string) =>
    request<void>(`/schedule-entries/${id}`, { method: 'DELETE' }),
  toggleWeeklyConfirm: (id: string) =>
    request<import('../types').ScheduleEntry>(`/schedule-entries/${id}/weekly-confirm`, { method: 'PATCH' }),

  // Search
  searchOpponents: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<import('../types').OpponentResult[]>(`/search/opponents?${qs}`);
  },
  getAutoMatches: (teamId: string) =>
    request<import('../types').AutoMatchResult[]>(`/search/auto-matches?team_id=${teamId}`),

  // Proposals
  createProposal: (data: {
    home_team_id: string;
    away_team_id: string;
    home_schedule_entry_id: string;
    away_schedule_entry_id: string;
    proposed_date: string;
    proposed_time?: string | null;
    proposed_by_team_id: string;
    ice_slot_id?: string | null;
    rink_id?: string | null;
    message?: string | null;
  }) =>
    request<import('../types').GameProposal>('/proposals', { method: 'POST', body: JSON.stringify(data) }),
  getProposals: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return request<import('../types').GameProposal[]>(`/teams/${teamId}/proposals?${qs}`);
  },
  acceptProposal: (id: string) =>
    request<import('../types').GameProposal>(`/proposals/${id}/accept`, { method: 'PATCH' }),
  declineProposal: (id: string) =>
    request<import('../types').GameProposal>(`/proposals/${id}/decline`, { method: 'PATCH' }),
  cancelProposal: (id: string) =>
    request<import('../types').GameProposal>(`/proposals/${id}/cancel`, { method: 'PATCH' }),
  rescheduleProposal: (
    id: string,
    data: {
      proposed_date: string;
      proposed_time?: string | null;
      proposed_by_team_id: string;
      ice_slot_id?: string | null;
      rink_id?: string | null;
      message?: string | null;
    },
  ) =>
    request<import('../types').GameProposal>(`/proposals/${id}/reschedule`, { method: 'POST', body: JSON.stringify(data) }),

  // Games
  getGames: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').Game[]>(`/teams/${teamId}/games${qs}`);
  },
  getGame: (id: string) => request<import('../types').Game>(`/games/${id}`),
  updateGame: (id: string, data: Partial<import('../types').Game>) =>
    request<import('../types').Game>(`/games/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  weeklyConfirmGame: (id: string, team_id: string, confirmed: boolean) =>
    request<import('../types').Game>(`/games/${id}/weekly-confirm`, { method: 'PATCH', body: JSON.stringify({ team_id, confirmed }) }),

  // Scoresheet
  getScoresheet: (gameId: string) =>
    request<import('../types').GameScoresheet>(`/games/${gameId}/scoresheet`),
  upsertPlayerStats: (gameId: string, stats: import('../types').GamePlayerStatUpsert[]) =>
    request<import('../types').GamePlayerStat[]>(`/games/${gameId}/player-stats`, {
      method: 'PUT',
      body: JSON.stringify({ stats }),
    }),
  listPenalties: (gameId: string) =>
    request<import('../types').GamePenalty[]>(`/games/${gameId}/penalties`),
  createPenalty: (gameId: string, data: Partial<import('../types').GamePenalty>) =>
    request<import('../types').GamePenalty>(`/games/${gameId}/penalties`, { method: 'POST', body: JSON.stringify(data) }),
  deletePenalty: (id: string) =>
    request<void>(`/game-penalties/${id}`, { method: 'DELETE' }),
  upsertGoalieStats: (gameId: string, stats: import('../types').GameGoalieStatUpsert[]) =>
    request<import('../types').GameGoalieStat[]>(`/games/${gameId}/goalie-stats`, {
      method: 'PUT',
      body: JSON.stringify({ stats }),
    }),
  listSignatures: (gameId: string) =>
    request<import('../types').GameSignature[]>(`/games/${gameId}/signatures`),
  signGame: (gameId: string, data: Partial<import('../types').GameSignature>) =>
    request<import('../types').GameSignature>(`/games/${gameId}/signatures`, { method: 'POST', body: JSON.stringify(data) }),

  // Notifications
  getNotifications: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').Notification[]>(`/teams/${teamId}/notifications${qs}`);
  },
  markNotificationRead: (id: string) =>
    request<import('../types').Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),

  // Rinks
  getRinks: () => request<import('../types').Rink[]>('/rinks'),
  createRink: (data: Partial<import('../types').Rink>) =>
    request<import('../types').Rink>('/rinks', { method: 'POST', body: JSON.stringify(data) }),
  updateRink: (id: string, data: Partial<import('../types').Rink>) =>
    request<import('../types').Rink>(`/rinks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRink: (id: string) =>
    request<void>(`/rinks/${id}`, { method: 'DELETE' }),

  // Ice Slots
  getIceSlots: (rinkId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').IceSlot[]>(`/rinks/${rinkId}/slots${qs}`);
  },
  createIceSlot: (rinkId: string, data: Partial<import('../types').IceSlot>) =>
    request<import('../types').IceSlot>(`/rinks/${rinkId}/slots`, { method: 'POST', body: JSON.stringify(data) }),
  uploadIceSlots: async (rinkId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/rinks/${rinkId}/slots/upload`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json() as Promise<import('../types').IceSlotUploadPreview>;
  },
  confirmIceSlotUpload: (rinkId: string, entries: import('../types').IceSlotUploadRow[]) =>
    request<import('../types').IceSlot[]>(`/rinks/${rinkId}/slots/confirm-upload`, {
      method: 'POST', body: JSON.stringify({ entries }),
    }),
  updateIceSlot: (id: string, data: Partial<import('../types').IceSlot>) =>
    request<import('../types').IceSlot>(`/ice-slots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIceSlot: (id: string) =>
    request<void>(`/ice-slots/${id}`, { method: 'DELETE' }),
  getAvailableSlots: (rinkId: string, date: string) =>
    request<import('../types').IceSlot[]>(`/rinks/${rinkId}/available-slots?date=${date}`),

  // Practice Bookings
  getPracticeBookings: (teamId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<import('../types').PracticeBooking[]>(`/teams/${teamId}/practice-bookings${qs}`);
  },
  createPracticeBooking: (teamId: string, data: { ice_slot_id: string; notes?: string | null }) =>
    request<import('../types').PracticeBooking>(`/teams/${teamId}/practice-bookings`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  cancelPracticeBooking: (bookingId: string) =>
    request<void>(`/practice-bookings/${bookingId}`, { method: 'DELETE' }),

  // Seed
  seed: () => request<{ message: string }>('/seed', { method: 'POST' }),
};
