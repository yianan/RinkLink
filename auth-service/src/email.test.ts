import test from "node:test";
import assert from "node:assert/strict";

import { buildFrontendVerificationUrl } from "./email.js";

test("buildFrontendVerificationUrl rewrites Better Auth verify-email links into the app shell", () => {
  const result = buildFrontendVerificationUrl(
    "https://rinklink-branch-app.onrender.com/api/auth/verify-email?token=abc123&callbackURL=https%3A%2F%2Frinklink-branch-app.onrender.com%2Fauth%2Fcallback%3FredirectTo%3D%252Fpending",
    "https://rinklink-branch-app.onrender.com",
  );

  assert.equal(
    result,
    "https://rinklink-branch-app.onrender.com/auth/verify-email?token=abc123&callbackURL=https%3A%2F%2Frinklink-branch-app.onrender.com%2Fauth%2Fcallback%3FredirectTo%3D%252Fpending",
  );
});

test("buildFrontendVerificationUrl leaves non-verification links unchanged", () => {
  const resetUrl = "https://rinklink-branch-app.onrender.com/api/auth/reset-password?token=abc123";

  assert.equal(
    buildFrontendVerificationUrl(resetUrl, "https://rinklink-branch-app.onrender.com"),
    resetUrl,
  );
});
