import type { MeResponse, Season, Team } from '../types';

const PROFILE_CACHE_KEY = 'rinklink.authProfile';
const TEAM_CACHE_KEY = 'rinklink.teamBootstrap';
const SEASON_CACHE_KEY = 'rinklink.seasons';
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const TEAM_CACHE_TTL_MS = 5 * 60 * 1000;
const SEASON_CACHE_TTL_MS = 15 * 60 * 1000;

type SessionLike = {
  user?: {
    id?: string;
    email?: string;
  };
} | null;

type CachedProfile = {
  authId: string | null;
  email: string | null;
  savedAt: number;
  me: MeResponse;
};

type CachedTeams = {
  authId: string | null;
  email: string | null;
  savedAt: number;
  teams: Team[];
};

type CachedSeasons = {
  savedAt: number;
  seasons: Season[];
};

function sessionIdentity(session: SessionLike) {
  return {
    authId: session?.user?.id ?? null,
    email: session?.user?.email?.toLowerCase() ?? null,
  };
}

function isFresh(savedAt: number, ttlMs: number) {
  return Date.now() - savedAt <= ttlMs;
}

function cacheMatchesSession(
  session: SessionLike,
  cached: { authId: string | null; email: string | null },
) {
  const identity = sessionIdentity(session);
  if (cached.authId && identity.authId && cached.authId !== identity.authId) {
    return false;
  }
  if (cached.email && identity.email && cached.email !== identity.email) {
    return false;
  }
  return true;
}

export function readCachedProfile(session: SessionLike): MeResponse | null {
  if (typeof window === 'undefined' || !session?.user) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedProfile;
    if (!parsed?.me || typeof parsed.savedAt !== 'number') {
      return null;
    }
    if (!isFresh(parsed.savedAt, PROFILE_CACHE_TTL_MS) || !cacheMatchesSession(session, parsed)) {
      window.sessionStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return parsed.me;
  } catch {
    return null;
  }
}

export function writeCachedProfile(me: MeResponse) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: CachedProfile = {
    authId: me.user.auth_id,
    email: me.user.email.toLowerCase(),
    savedAt: Date.now(),
    me,
  };
  window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(payload));
}

export function clearCachedProfile() {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(PROFILE_CACHE_KEY);
}

export function readCachedTeams(session: SessionLike): Team[] {
  if (typeof window === 'undefined' || !session?.user) {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(TEAM_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CachedTeams;
    if (!Array.isArray(parsed?.teams) || typeof parsed.savedAt !== 'number') {
      return [];
    }
    if (!isFresh(parsed.savedAt, TEAM_CACHE_TTL_MS) || !cacheMatchesSession(session, parsed)) {
      window.sessionStorage.removeItem(TEAM_CACHE_KEY);
      return [];
    }
    return parsed.teams;
  } catch {
    return [];
  }
}

export function writeCachedTeams(session: SessionLike, teams: Team[]) {
  if (typeof window === 'undefined') {
    return;
  }

  const identity = sessionIdentity(session);
  const payload: CachedTeams = {
    authId: identity.authId,
    email: identity.email,
    savedAt: Date.now(),
    teams,
  };
  window.sessionStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(payload));
}

export function clearCachedTeams() {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(TEAM_CACHE_KEY);
}

export function readCachedSeasons(): Season[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SEASON_CACHE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as CachedSeasons;
    if (!Array.isArray(parsed?.seasons) || typeof parsed.savedAt !== 'number') {
      return [];
    }
    if (!isFresh(parsed.savedAt, SEASON_CACHE_TTL_MS)) {
      window.localStorage.removeItem(SEASON_CACHE_KEY);
      return [];
    }
    return parsed.seasons;
  } catch {
    return [];
  }
}

export function writeCachedSeasons(seasons: Season[]) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: CachedSeasons = {
    savedAt: Date.now(),
    seasons,
  };
  window.localStorage.setItem(SEASON_CACHE_KEY, JSON.stringify(payload));
}
