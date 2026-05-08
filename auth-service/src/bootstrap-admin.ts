import "dotenv/config";

import { randomUUID } from "node:crypto";

import { auth, pool } from "./auth.js";
import { queryWithRetry } from "./db.js";
import { hashPassword } from "./password.js";

type AuthUserRow = {
  id: string;
  email: string;
  name: string | null;
};

type AppUserRow = {
  id: string;
};

function requiredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.toLowerCase().includes("already") ||
    message.toLowerCase().includes("exists") ||
    message.toLowerCase().includes("unique")
  );
}

async function findAuthUser(email: string): Promise<AuthUserRow | null> {
  const result = await queryWithRetry<AuthUserRow>(
    pool,
    `
      SELECT id, email, name
      FROM auth."user"
      WHERE lower(email) = $1
      LIMIT 1
    `,
    [email.toLowerCase()],
  );
  return result.rows[0] ?? null;
}

async function ensureAuthUser(email: string, password: string, name: string): Promise<AuthUserRow> {
  const existing = await findAuthUser(email);
  if (existing) {
    console.info(`[bootstrap-admin] Auth user already exists: ${email}`);
    return existing;
  }

  try {
    await auth.api.signUpEmail({
      body: { email, password, name },
    });
    console.info(`[bootstrap-admin] Created auth user: ${email}`);
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
    console.info(`[bootstrap-admin] Auth user already exists after create race: ${email}`);
  }

  const created = await findAuthUser(email);
  if (!created) {
    throw new Error(`Failed to find bootstrap auth user after create: ${email}`);
  }
  return created;
}

async function verifyAuthUser(authId: string, name: string): Promise<void> {
  await queryWithRetry(
    pool,
    `
      UPDATE auth."user"
      SET "emailVerified" = true,
          name = COALESCE(NULLIF($2, ''), name),
          "updatedAt" = NOW()
      WHERE id = $1
    `,
    [authId, name],
  );
}

async function refreshBootstrapPassword(authId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await queryWithRetry(
    pool,
    `
      UPDATE auth.account
      SET password = $2,
          "updatedAt" = NOW()
      WHERE "userId" = $1
        AND "providerId" = 'credential'
    `,
    [authId, passwordHash],
  );
  console.info("[bootstrap-admin] Refreshed bootstrap admin password hash");
}

async function upsertPlatformAdmin(authUser: AuthUserRow, name: string): Promise<void> {
  const existing = await queryWithRetry<AppUserRow>(
    pool,
    `
      SELECT id
      FROM public.app_users
      WHERE auth_id = $1 OR lower(email) = $2
      LIMIT 1
    `,
    [authUser.id, authUser.email.toLowerCase()],
  );

  const displayName = name || authUser.name || authUser.email;

  if (existing.rows[0]) {
    await queryWithRetry(
      pool,
      `
        UPDATE public.app_users
        SET auth_id = $2,
            email = $3,
            display_name = $4,
            status = 'active',
            access_state = 'active',
            auth_state = 'active',
            is_platform_admin = true,
            revoked_at = NULL,
            updated_at = NOW()
        WHERE id = $1
      `,
      [existing.rows[0].id, authUser.id, authUser.email, displayName],
    );
    console.info(`[bootstrap-admin] Promoted existing app user to platform admin: ${authUser.email}`);
    return;
  }

  await queryWithRetry(
    pool,
    `
      INSERT INTO public.app_users (
        id,
        auth_id,
        email,
        display_name,
        status,
        access_state,
        auth_state,
        is_platform_admin,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'active', 'active', 'active', true, NOW(), NOW())
    `,
    [randomUUID(), authUser.id, authUser.email, displayName],
  );
  console.info(`[bootstrap-admin] Created platform admin app user: ${authUser.email}`);
}

async function main(): Promise<void> {
  const email = requiredEnv("RINKLINK_BOOTSTRAP_ADMIN_EMAIL");
  const password = requiredEnv("RINKLINK_BOOTSTRAP_ADMIN_PASSWORD");
  const name = requiredEnv("RINKLINK_BOOTSTRAP_ADMIN_NAME") ?? "RinkLink Admin";

  if (!email && !password) {
    console.info("[bootstrap-admin] No bootstrap admin configured");
    return;
  }

  if (!email || !password) {
    throw new Error(
      "RINKLINK_BOOTSTRAP_ADMIN_EMAIL and RINKLINK_BOOTSTRAP_ADMIN_PASSWORD must both be set",
    );
  }

  const authUser = await ensureAuthUser(email.toLowerCase(), password, name);
  await verifyAuthUser(authUser.id, name);
  await refreshBootstrapPassword(authUser.id, password);
  await upsertPlatformAdmin({ ...authUser, email: email.toLowerCase() }, name);
}

main()
  .catch((error) => {
    console.error("[bootstrap-admin] Failed to bootstrap platform admin", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
