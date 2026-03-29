import "dotenv/config";

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { auth } from "./auth.js";

const app = new Hono();
const port = Number(process.env.PORT || 3000);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
  "/api/auth/*",
  cors({
    origin: frontendUrl,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.get("/.well-known/jwks.json", (c) => auth.handler(c.req.raw));

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.info(`[auth-service] listening on http://localhost:${info.port}`);
  },
);
