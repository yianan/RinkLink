import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth } from "./auth.js";
import { resolvePublicAppUrl, resolveTrustedOrigins } from "./config.js";

const app = new Hono();
const port = Number(process.env.AUTH_SERVICE_PORT || process.env.PORT || 3000);
const frontendUrl = resolvePublicAppUrl();
const allowedOrigins = new Set(resolveTrustedOrigins());

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
