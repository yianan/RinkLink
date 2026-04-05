import "dotenv/config";

const LOCAL_FRONTEND_URL = "http://localhost:5173";

function normalizeUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

export function resolvePublicAppUrl(): string {
  return normalizeUrl(process.env.PUBLIC_APP_URL)
    || normalizeUrl(process.env.RENDER_EXTERNAL_URL)
    || normalizeUrl(process.env.FRONTEND_URL)
    || LOCAL_FRONTEND_URL;
}

export function resolveBetterAuthUrl(): string {
  return normalizeUrl(process.env.BETTER_AUTH_URL)
    || resolvePublicAppUrl();
}

export function resolveApiAudience(): string | null {
  return normalizeUrl(process.env.API_AUDIENCE)
    || normalizeUrl(process.env.PUBLIC_APP_URL)
    || normalizeUrl(process.env.RENDER_EXTERNAL_URL);
}
