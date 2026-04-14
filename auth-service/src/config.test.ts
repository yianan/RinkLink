import test from "node:test";
import assert from "node:assert/strict";

import { requireBetterAuthSecret } from "./config.js";

test("requireBetterAuthSecret rejects missing secret", () => {
  const originalSecret = process.env.BETTER_AUTH_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.BETTER_AUTH_SECRET;
  process.env.NODE_ENV = "production";

  assert.throws(() => requireBetterAuthSecret(), /BETTER_AUTH_SECRET is required/);

  process.env.BETTER_AUTH_SECRET = originalSecret;
  process.env.NODE_ENV = originalNodeEnv;
});

test("requireBetterAuthSecret rejects short production secret", () => {
  const originalSecret = process.env.BETTER_AUTH_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.BETTER_AUTH_SECRET = "short-secret";
  process.env.NODE_ENV = "production";

  assert.throws(() => requireBetterAuthSecret(), /at least 32 characters/);

  process.env.BETTER_AUTH_SECRET = originalSecret;
  process.env.NODE_ENV = originalNodeEnv;
});
