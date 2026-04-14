import { Pool } from "pg";

const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_FAILURE_LIMIT = 5;
const LOCKOUT_DURATION_MINUTES = 15;

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() || "";
  return normalized || null;
}

export async function ensureLockoutSchema(pool: Pool): Promise<void> {
  await pool.query(`
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
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const result = await pool.query<{
    locked_until: Date | null;
  }>(
    `SELECT locked_until FROM auth.sign_in_lockouts WHERE email = $1`,
    [normalizedEmail],
  );
  const row = result.rows[0];
  return Boolean(row?.locked_until && row.locked_until.getTime() > Date.now());
}

export async function clearSignInFailures(pool: Pool, email: string | null | undefined): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }
  await pool.query(`DELETE FROM auth.sign_in_lockouts WHERE email = $1`, [normalizedEmail]);
}

export async function recordSignInFailure(pool: Pool, email: string | null | undefined): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  await pool.query(
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
    `,
    [normalizedEmail],
  );
}
