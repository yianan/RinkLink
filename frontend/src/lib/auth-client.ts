import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

const defaultAuthOrigin = import.meta.env.DEV
  ? 'http://localhost:3000'
  : window.location.origin;
const authOrigin = (import.meta.env.VITE_AUTH_BASE_URL || defaultAuthOrigin).replace(/\/+$/, '');
export const authApiBaseUrl = `${authOrigin}/api/auth`;
const tokenRefreshSkewMs = 30_000;
const tokenStorageKey = 'rinklink.apiToken';

const authFlag = import.meta.env.VITE_AUTH_ENABLED;

export const authEnabled = authFlag === undefined
  ? import.meta.env.DEV
  : authFlag === 'true';
export const authClient = createAuthClient({
  baseURL: authOrigin,
  plugins: [
    twoFactorClient({
      twoFactorPage: '/auth/two-factor',
    }),
  ],
  sessionOptions: {
    refetchOnWindowFocus: false,
  },
});

let cachedApiToken: string | null = null;
let cachedApiTokenExpiresAt = 0;
let tokenRequest: Promise<string | null> | null = null;

function parseJwtExpiration(token: string): number {
  try {
    const [, payload] = token.split('.');
    if (!payload) return 0;
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(normalizedPayload.length + ((4 - normalizedPayload.length % 4) % 4), '=');
    const decoded = JSON.parse(window.atob(paddedPayload));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function cacheApiAccessToken(token: string) {
  cachedApiToken = token;
  cachedApiTokenExpiresAt = parseJwtExpiration(token);
  try {
    window.sessionStorage.setItem(tokenStorageKey, JSON.stringify({
      token,
      expiresAt: cachedApiTokenExpiresAt,
    }));
  } catch {
    // Session storage is an optimization only; the memory cache still works.
  }
}

function loadStoredApiAccessToken(now: number): string | null {
  if (cachedApiToken && cachedApiTokenExpiresAt > now + tokenRefreshSkewMs) {
    return cachedApiToken;
  }
  try {
    const stored = window.sessionStorage.getItem(tokenStorageKey);
    if (!stored) return null;
    const payload = JSON.parse(stored) as { token?: string; expiresAt?: number };
    if (!payload.token || !payload.expiresAt || payload.expiresAt <= now + tokenRefreshSkewMs) {
      window.sessionStorage.removeItem(tokenStorageKey);
      return null;
    }
    cachedApiToken = payload.token;
    cachedApiTokenExpiresAt = payload.expiresAt;
    return payload.token;
  } catch {
    return null;
  }
}

export function clearApiAccessToken() {
  cachedApiToken = null;
  cachedApiTokenExpiresAt = 0;
  try {
    window.sessionStorage.removeItem(tokenStorageKey);
  } catch {
    // Ignore storage availability failures.
  }
}

export async function getApiAccessToken(forceRefresh = false): Promise<string | null> {
  if (!authEnabled) {
    return null;
  }

  const now = Date.now();
  if (!forceRefresh) {
    const storedToken = loadStoredApiAccessToken(now);
    if (storedToken) {
      return storedToken;
    }
  }

  if (!forceRefresh && tokenRequest) {
    return tokenRequest;
  }

  tokenRequest = (async () => {
    const response = await fetch(`${authApiBaseUrl}/token`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      clearApiAccessToken();
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status}: ${text}`);
    }

    const payload = await response.json() as { token?: string };
    if (!payload.token) {
      clearApiAccessToken();
      return null;
    }

    cacheApiAccessToken(payload.token);
    return payload.token;
  })().finally(() => {
    tokenRequest = null;
  });

  return tokenRequest;
}
