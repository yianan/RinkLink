export const AUTH_RETURN_TO_KEY = 'rinklink.returnTo';

export function setAuthReturnTo(path: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, path);
}

export function peekAuthReturnTo() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
}

export function consumeAuthReturnTo() {
  if (typeof window === 'undefined') {
    return null;
  }
  const returnTo = window.sessionStorage.getItem(AUTH_RETURN_TO_KEY);
  if (!returnTo) {
    return null;
  }
  window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  return returnTo;
}

export function buildAuthCallbackUrl(fallbackPath = '/pending') {
  if (typeof window === 'undefined') {
    return `/auth/callback?redirectTo=${encodeURIComponent(fallbackPath)}`;
  }
  const redirectTo = peekAuthReturnTo() || fallbackPath;
  return `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`;
}
