import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth, isAuthDisabledForEmail, pool } from "./auth.js";
import { ensureLockoutSchema, clearSignInFailures, getSignInFailureState, recordSignInFailure } from "./lockout.js";
import { resolvePublicAppUrl, resolveTrustedOrigins } from "./config.js";
import { recordTiming, timingHeader, withTimingContext } from "./timing.js";

const app = new Hono();
const port = Number(process.env.AUTH_SERVICE_PORT || process.env.PORT || 3000);
const hostname = process.env.AUTH_SERVICE_HOST || "0.0.0.0";
const frontendUrl = resolvePublicAppUrl();
const allowedOrigins = new Set(resolveTrustedOrigins());
await ensureLockoutSchema(pool);

function authProxyRequest(request: Request, pathname: string): Request {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

app.use(
  "/api/auth/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return frontendUrl;
      }

      return allowedOrigins.has(origin) ? origin : frontendUrl;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.use("/api/auth/*", async (c, next) => {
  await withTimingContext(async () => {
    const startedAt = performance.now();
    await next();
    const durationMs = performance.now() - startedAt;
    c.header("X-Auth-Service-Time-Ms", durationMs.toFixed(1));
    const serverTiming = timingHeader();
    if (serverTiming) {
      c.header("Server-Timing", serverTiming);
    }
    console.info(
      `[auth-service] request_timing method=${c.req.method} path=${c.req.path} status=${c.res.status} duration_ms=${durationMs.toFixed(1)} timings="${serverTiming ?? ""}"`,
    );
  });
});

app.use("/api/auth/sign-in/email", async (c, next) => {
  const requestClone = c.req.raw.clone();
  const body = await requestClone.json().catch(() => null) as { email?: string } | null;
  const email = body?.email;

  const lockoutStartedAt = performance.now();
  const failureState = await getSignInFailureState(pool, email);
  recordTiming("lockout", performance.now() - lockoutStartedAt);
  if (failureState.locked) {
    return c.json({ code: "ACCOUNT_LOCKED", message: "Too many failed sign-in attempts. Try again later." }, 423);
  }
  const disabledStartedAt = performance.now();
  const authDisabled = await isAuthDisabledForEmail(email);
  recordTiming("disabled_account", performance.now() - disabledStartedAt);
  if (authDisabled) {
    return c.json({ code: "ACCOUNT_DISABLED", message: "Sign-in is disabled for this account." }, 403);
  }

  const betterAuthStartedAt = performance.now();
  await next();
  recordTiming("better_auth", performance.now() - betterAuthStartedAt);

  if (c.res.status >= 200 && c.res.status < 300) {
    if (failureState.hasFailures) {
      const clearStartedAt = performance.now();
      await clearSignInFailures(pool, email);
      recordTiming("clear_lockout", performance.now() - clearStartedAt);
    }
    return;
  }
  if ([400, 401, 403].includes(c.res.status)) {
    const recordStartedAt = performance.now();
    await recordSignInFailure(pool, email);
    recordTiming("record_failure", performance.now() - recordStartedAt);
  }
});

app.get("/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.get("/.well-known/jwks.json", (c) =>
  auth.handler(authProxyRequest(c.req.raw, "/api/auth/.well-known/jwks.json")),
);

serve(
  {
    fetch: app.fetch,
    hostname,
    port,
  },
  (info) => {
    console.info(`[auth-service] listening on http://${hostname}:${info.port}`);
  },
);
