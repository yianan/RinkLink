import { createAuthClient } from 'better-auth/react';

const authOrigin = (import.meta.env.VITE_AUTH_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const authApiBaseUrl = `${authOrigin}/api/auth`;
const tokenRefreshSkewMs = 30_000;

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED === 'true';
export const authClient = createAuthClient({
  baseURL: authOrigin,
});

let cachedApiToken: string | null = null;
let cachedApiTokenExpiresAt = 0;
let tokenRequest: Promise<string | null> | null = null;

function parseJwtExpiration(token: string): number {
  try {
    const [, payload] = token.split('.');
    if (!payload) return 0;
    const decoded = JSON.parse(window.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function clearApiAccessToken() {
  cachedApiToken = null;
  cachedApiTokenExpiresAt = 0;
}

export async function getApiAccessToken(forceRefresh = false): Promise<string | null> {
  if (!authEnabled) {
    return null;
  }

  const now = Date.now();
  if (!forceRefresh && cachedApiToken && cachedApiTokenExpiresAt > now + tokenRefreshSkewMs) {
    return cachedApiToken;
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

    cachedApiToken = payload.token;
    cachedApiTokenExpiresAt = parseJwtExpiration(payload.token);
    return payload.token;
  })().finally(() => {
    tokenRequest = null;
  });

  return tokenRequest;
}
