/**
 * Seed script for local development.
 * Creates test users in Better Auth with known passwords.
 *
 * Usage: npx tsx src/seed.ts
 *
 * These users correspond to the app_users rows created by the backend
 * seed endpoint (POST /api/seed). Run this script first, then hit the
 * backend seed endpoint to create matching memberships.
 */

import "dotenv/config";

import { auth } from "./auth.js";

interface SeedUser {
  email: string;
  password: string;
  name: string;
}

const SEED_USERS: SeedUser[] = [
  // Platform admin
  { email: "admin@rinklink.dev", password: "Password1!", name: "Platform Admin" },

  // Association admin
  { email: "assoc-admin@rinklink.dev", password: "Password1!", name: "Association Admin" },

  // Team staff
  { email: "team-admin@rinklink.dev", password: "Password1!", name: "Team Admin" },
  { email: "manager@rinklink.dev", password: "Password1!", name: "Team Manager" },
  { email: "scheduler@rinklink.dev", password: "Password1!", name: "Team Scheduler" },
  { email: "coach@rinklink.dev", password: "Password1!", name: "Team Coach" },

  // Arena staff
  { email: "arena-admin@rinklink.dev", password: "Password1!", name: "Arena Admin" },
  { email: "arena-ops@rinklink.dev", password: "Password1!", name: "Arena Ops" },

  // Family
  { email: "parent@rinklink.dev", password: "Password1!", name: "Parent User" },
  { email: "player@rinklink.dev", password: "Password1!", name: "Player User" },
];

async function seed() {
  console.info("[seed] Creating test users...");

  for (const user of SEED_USERS) {
    try {
      const ctx = await auth.api.signUpEmail({
        body: {
          email: user.email,
          password: user.password,
          name: user.name,
        },
      });
      console.info(`[seed] Created: ${user.email} (id: ${ctx.user.id})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // User may already exist from a previous seed run
      if (message.includes("already") || message.includes("exists") || message.includes("unique")) {
        console.info(`[seed] Skipped (exists): ${user.email}`);
      } else {
        console.error(`[seed] Failed to create ${user.email}: ${message}`);
      }
    }
  }

  console.info("[seed] Done. Run POST /api/seed on the backend to create matching memberships.");
}

seed().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
