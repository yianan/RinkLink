import "dotenv/config";

const LOCAL_FRONTEND_URL = "http://localhost:5173";

function normalizeUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

function parseUrls(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => normalizeUrl(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function resolveTrustedOrigins(): string[] {
  const explicitOrigins = parseUrls(process.env.TRUSTED_ORIGINS);

  if (explicitOrigins.length > 0) {
    return explicitOrigins;
  }

  const frontendOrigins = parseUrls(process.env.FRONTEND_URL);

  if (frontendOrigins.length > 0) {
    return frontendOrigins;
  }

  return [LOCAL_FRONTEND_URL];
}

export function resolvePublicAppUrl(): string {
  return normalizeUrl(process.env.PUBLIC_APP_URL)
    || normalizeUrl(process.env.RENDER_EXTERNAL_URL)
    || resolveTrustedOrigins()[0]
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
