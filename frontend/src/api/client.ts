const BASE_URL = 'http://localhost:8000/api';

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
  createProposal: (data: Partial<import('../types').GameProposal>) =>
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

  // Seed
  seed: () => request<{ message: string }>('/seed', { method: 'POST' }),
};
