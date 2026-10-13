// Preserve the original components' data contracts over the smaller API.
// Excluded features have no routes or controls in the minimal application.
type Row = Record<string, unknown>;
const pick = (row: Row, keys: string[]) => Object.fromEntries(keys.filter(key => key in row).map(key => [key, row[key]]));
const teamCache = new Map<string, Row>();
const teamKeys = ['name', 'club_name', 'age_group', 'level', 'home_zip_code', 'home_arena_id', 'home_arena_rink_id', 'manager_name', 'manager_email', 'manager_phone', 'myhockey_ranking'];
const intervalKeys = ['date', 'start_time', 'end_time', 'availability_type', 'notes', 'season_id', 'blocked'];
const proposalKeys = ['home_team_id', 'away_team_id', 'home_availability_window_id', 'away_availability_window_id', 'proposed_by_team_id', 'event_type', 'proposed_date', 'proposed_start_time', 'proposed_end_time', 'arena_id', 'arena_rink_id', 'message'];

export function prepareRequest(path: string, options: RequestInit = {}): [string, RequestInit] {
  let nextPath = path.replace('/teams/summary', '/teams').replace('/public/access-targets', '/access-targets/public').replace('/account/close', '/me/close-account').replace('/invites/by-token/', '/invites/');
  if (path.startsWith('/teams/summary')) { const url = new URL(nextPath, 'http://local'); url.searchParams.set('mine','true'); nextPath = url.pathname + url.search; }
  if (path.startsWith('/invites?')) { const url = new URL(nextPath, 'http://local'); if (url.searchParams.get('direction') === 'received') url.searchParams.set('direction','mine'); nextPath = url.pathname + url.search; }
  let next = { ...options };
  if (typeof options.body === 'string') {
    const body = JSON.parse(options.body) as Row;
    let clean = body;
    if (/^\/teams(?:\/[^/?]+)?(?:\?|$)/.test(path) && ['POST', 'PUT'].includes(options.method || '')) clean = pick({ ...(teamCache.get(path.split('/')[2]) || {}), ...body }, teamKeys);
    if (path.includes('/availability')) clean = pick(body, intervalKeys);
    if (/^\/arenas(?:\/[^/?]+)?$/.test(path) && ['POST','PUT'].includes(options.method || '')) clean = pick(body, ['name','address','city','state','zip_code','phone','contact_email','website','notes']);
    if (path === '/invites') clean = pick(body, ['email','target_type','target_id','role']);
    if (/\/access-requests\/[^/]+\/(approve|reject)$/.test(path) && !body.role) clean = pick(body, ['reason']);
    if (path === '/proposals') clean = pick(body, proposalKeys);
    if (path.endsWith('/reschedule')) {
      clean = pick(body, ['proposed_by_team_id', 'proposed_date', 'proposed_start_time', 'proposed_end_time', 'arena_id', 'arena_rink_id', 'message']);
      next = { ...next, method: 'POST' };
    }
    if (path === '/access-requests' && body.details) {
      const details = body.details as Row;
      clean = { ...body, details: pick({ ...details, name: details.team_name || details.name, club_name: details.club_name || details.association_name || '', home_zip_code: details.home_zip_code || details.zip_code || '' }, teamKeys) };
    }
    if (/^\/events\/[^/]+$/.test(path) && options.method === 'PATCH') next.method = 'PUT';
    next.body = JSON.stringify(clean);
  }
  if (/^\/access-requests\/[^/]+\/(approve|reject)$/.test(path)) next = { ...next, method: 'POST' };
  if (path.startsWith('/memberships/team/')) nextPath = path.replace('/memberships/team/', '/team-memberships/');
  return [nextPath, next];
}

function normalizeTeam(row: Row): Row {
  if (row.id) teamCache.set(String(row.id), row);
  return { association_id: null, logo_url: row.logo_asset_id ? `/api/team-logos/${row.logo_asset_id}` : null, primary_membership: null, memberships: [], wins: 0, losses: 0, ties: 0, ...row, home_team_name: teamCache.get(String(row.home_team_id))?.name, away_team_name: teamCache.get(String(row.away_team_id))?.name, away_start_time: row.start_time, away_end_time: row.end_time, association_name: row.club_name || null };
}
function normalizeMe(row: Row): Row {
  return { ...row, capabilities: [...((row.capabilities || []) as string[]), ...((row.capabilities || []) as string[]).filter(x=>x.startsWith('venue.')).map(x=>x.replace('venue.','arena.')), ...((row.capabilities || []) as string[]).includes('venue.manage') ? ['arena.view'] : []], associations: [], arenas: [], linked_players: [], accessible_teams: ((row.accessible_teams || []) as Row[]).map(normalizeTeam) };
}
function normalizeItem(path: string, row: Row): Row {
  if (path === '/me') return normalizeMe(row);
  if (path.startsWith('/teams') && !/\/(events|proposals|availability|calendar)/.test(path)) return normalizeTeam(row);
  if (path.startsWith('/arenas') && !path.includes('/rinks')) return { ...row, logo_url: row.logo_asset_id ? `/api/arena-logos/${row.logo_asset_id}` : null };
  if (path.includes('/search/')) return {
    team_logo_url: null, home_team_logo_url: null, away_team_logo_url: null,
    primary_competition_short_name: null, primary_division_name: null,
    home_primary_competition_short_name: null, home_primary_division_name: null,
    away_primary_competition_short_name: null, away_primary_division_name: null,
    ...row, home_team_name: teamCache.get(String(row.home_team_id))?.name, away_team_name: teamCache.get(String(row.away_team_id))?.name, away_start_time: row.start_time, away_end_time: row.end_time, association_name: row.club_name || '', home_association_name: row.home_club_name || '', away_association_name: row.away_club_name || '',
  };
  if (path.includes('/events') || path.includes('/proposals')) return {
    home_team_logo_url: null, away_team_logo_url: null,
    home_team_association: null, away_team_association: null, arena_logo_url: null,
    competition_division_id: null, competition_name: null, competition_short_name: null, division_name: null,
    attendance_summary: null, schedule_warnings: [], home_score: null, away_score: null,
    home_weekly_confirmed: false, away_weekly_confirmed: false,
    home_locker_room_id: null, away_locker_room_id: null, home_locker_room_name: null, away_locker_room_name: null,
    ice_slot_id: null, ice_slot_date: null, ice_slot_start_time: null, ice_slot_end_time: null,
    ...row, home_association_name: row.home_association_name || teamCache.get(String(row.home_team_id))?.club_name || null, away_association_name: row.away_association_name || teamCache.get(String(row.away_team_id))?.club_name || null,
  };
  if (path.includes('access-targets')) return { ...row, type: 'team', context: [row.age_group, row.level].filter(Boolean).join(' ') };
  if (path.includes('/access-requests')) return { ...row,
    requester: { id: row.user_id, email: row.user_email, display_name: row.user_email },
    target: { type: row.target_type, id: row.target_id, name: row.team_name, context: null },
    details: { ...((row.details_json || {}) as Row), team_name: (row.details_json as Row)?.name },
  };
  if (path.includes('/invites')) return { ...row, target: { type: 'team', id: row.target_id, name: row.team_name, context: null }, invite_url: row.url };
  return row;
}
export function normalizeResponse<T>(path: string, payload: unknown): T {
  if (path === '/app-bootstrap') {
    const row = payload as Row;
    return { ...row, me: normalizeMe(row.me as Row), teams: ((row.teams || []) as Row[]).map(normalizeTeam), initial_dashboard: null } as T;
  }
  if (Array.isArray(payload)) {
    const url = new URL(path, 'http://local');
    let rows = (payload as Row[]).map(row => normalizeItem(path, row));
    const teamId = path.match(/^\/teams\/([^/]+)\//)?.[1];
    const q = url.searchParams.get('q');
    if (q && path.includes('access-targets')) rows = rows.filter(row => String(row.name).toLowerCase().includes(q.toLowerCase()));
    const status = url.searchParams.get('status');
    if (status) rows = rows.filter(row => row.status === status);
    if (url.searchParams.get('direction') === 'incoming') rows = rows.filter(row => row.proposed_by_team_id !== teamId);
    if (url.searchParams.get('direction') === 'outgoing') rows = rows.filter(row => row.proposed_by_team_id === teamId);
    const from = url.searchParams.get('date_from'), to = url.searchParams.get('date_to');
    if (from) rows = rows.filter(row => String(row.date || row.proposed_date) >= from);
    if (to) rows = rows.filter(row => String(row.date || row.proposed_date) <= to);
    return rows as T;
  }
  return (payload && typeof payload === 'object' ? normalizeItem(path, payload as Row) : payload) as T;
}
