import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth, isAuthDisabledForEmail, pool } from "./auth.js";
import { ensureLockoutSchema, clearSignInFailures, isSignInLocked, recordSignInFailure } from "./lockout.js";
import { resolvePublicAppUrl, resolveTrustedOrigins } from "./config.js";

const app = new Hono();
const port = Number(process.env.AUTH_SERVICE_PORT || process.env.PORT || 3000);
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

app.use("/api/auth/sign-in/email", async (c, next) => {
  const requestClone = c.req.raw.clone();
  const body = await requestClone.json().catch(() => null) as { email?: string } | null;
  const email = body?.email;

  if (await isSignInLocked(pool, email)) {
    return c.json({ code: "ACCOUNT_LOCKED", message: "Too many failed sign-in attempts. Try again later." }, 423);
  }
  if (await isAuthDisabledForEmail(email)) {
    return c.json({ code: "ACCOUNT_DISABLED", message: "Sign-in is disabled for this account." }, 403);
  }

  await next();

  if (c.res.status >= 200 && c.res.status < 300) {
    await clearSignInFailures(pool, email);
    return;
  }
  if ([400, 401, 403].includes(c.res.status)) {
    await recordSignInFailure(pool, email);
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
    port,
  },
  (info) => {
    console.info(`[auth-service] listening on http://localhost:${info.port}`);
  },
);
