import { Pool } from "pg";
import { queryWithRetry } from "./db.js";

const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_FAILURE_LIMIT = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const CLEAN_LOCKOUT_CACHE_MS = 5 * 60 * 1000;
const CHECK_PERSISTENT_LOCKOUT_ON_SIGNIN = process.env.AUTH_LOCKOUT_DB_CHECK_ON_SIGNIN === "true";

type SignInFailureState = { locked: boolean; hasFailures: boolean };
const failureStateCache = new Map<string, { value: SignInFailureState; expiresAt: number }>();

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() || "";
  return normalized || null;
}

export async function ensureLockoutSchema(pool: Pool): Promise<void> {
  await queryWithRetry(pool, `
    CREATE TABLE IF NOT EXISTS auth.sign_in_lockouts (
      email TEXT PRIMARY KEY,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      first_failed_at TIMESTAMPTZ NOT NULL,
      locked_until TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function isSignInLocked(pool: Pool, email: string | null | undefined): Promise<boolean> {
  return (await getSignInFailureState(pool, email)).locked;
}

export async function getSignInFailureState(
  pool: Pool,
  email: string | null | undefined,
): Promise<SignInFailureState> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { locked: false, hasFailures: false };
  }

  const cached = failureStateCache.get(normalizedEmail);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    failureStateCache.delete(normalizedEmail);
  }

  if (!CHECK_PERSISTENT_LOCKOUT_ON_SIGNIN) {
    const state = { locked: false, hasFailures: false };
    cacheFailureState(normalizedEmail, state);
    return state;
  }

  const result = await queryWithRetry<{
    locked_until: Date | null;
    failed_attempts: number;
  }>(
    pool,
    `SELECT locked_until, failed_attempts FROM auth.sign_in_lockouts WHERE email = $1`,
    [normalizedEmail],
  );
  const row = result.rows[0];
  const state = {
    locked: Boolean(row?.locked_until && row.locked_until.getTime() > Date.now()),
    hasFailures: Boolean(row && row.failed_attempts > 0),
  };
  cacheFailureState(normalizedEmail, state, row?.locked_until);
  return state;
}

export async function clearSignInFailures(pool: Pool, email: string | null | undefined): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }
  await queryWithRetry(pool, `DELETE FROM auth.sign_in_lockouts WHERE email = $1`, [normalizedEmail]);
  failureStateCache.set(normalizedEmail, {
    value: { locked: false, hasFailures: false },
    expiresAt: Date.now() + CLEAN_LOCKOUT_CACHE_MS,
  });
}

export async function recordSignInFailure(pool: Pool, email: string | null | undefined): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  const result = await queryWithRetry<{
    locked_until: Date | null;
    failed_attempts: number;
  }>(
    pool,
    `
      INSERT INTO auth.sign_in_lockouts (email, failed_attempts, first_failed_at, locked_until, updated_at)
      VALUES ($1, 1, NOW(), NULL, NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        failed_attempts = CASE
          WHEN auth.sign_in_lockouts.first_failed_at < NOW() - INTERVAL '${LOCKOUT_WINDOW_MINUTES} minutes'
            THEN 1
          ELSE auth.sign_in_lockouts.failed_attempts + 1
        END,
        first_failed_at = CASE
          WHEN auth.sign_in_lockouts.first_failed_at < NOW() - INTERVAL '${LOCKOUT_WINDOW_MINUTES} minutes'
            THEN NOW()
          ELSE auth.sign_in_lockouts.first_failed_at
        END,
        locked_until = CASE
          WHEN auth.sign_in_lockouts.first_failed_at < NOW() - INTERVAL '${LOCKOUT_WINDOW_MINUTES} minutes'
            THEN NULL
          WHEN auth.sign_in_lockouts.failed_attempts + 1 >= ${LOCKOUT_FAILURE_LIMIT}
            THEN NOW() + INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
          ELSE auth.sign_in_lockouts.locked_until
        END,
        updated_at = NOW()
      RETURNING locked_until, failed_attempts
    `,
    [normalizedEmail],
  );
  const row = result.rows[0];
  cacheFailureState(
    normalizedEmail,
    {
      locked: Boolean(row?.locked_until && row.locked_until.getTime() > Date.now()),
      hasFailures: Boolean(row && row.failed_attempts > 0),
    },
    row?.locked_until,
  );
}

function cacheFailureState(
  email: string,
  state: SignInFailureState,
  lockedUntil?: Date | null,
): void {
  const lockExpiration = lockedUntil?.getTime() ?? 0;
  const ttl = state.locked && lockExpiration > Date.now()
    ? lockExpiration - Date.now()
    : CLEAN_LOCKOUT_CACHE_MS;
  failureStateCache.set(email, {
    value: state,
    expiresAt: Date.now() + ttl,
  });
}
