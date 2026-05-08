import "dotenv/config";

import { Client } from "pg";

const databaseUrl = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to ensure the auth schema");
}

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10000,
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(): Promise<void> {
  let lastError: unknown;
  const delays = [500, 1000, 2500, 5000, 10000];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await client.connect();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === delays.length) {
        throw error;
      }
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
}

async function main() {
  await connectWithRetry();
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS auth");
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('auth."user"') IS NOT NULL THEN
          WITH ranked_users AS (
            SELECT
              u.id,
              ROW_NUMBER() OVER (
                PARTITION BY lower(u.email)
                ORDER BY
                  u."emailVerified" DESC,
                  u."createdAt" ASC,
                  u.id ASC
              ) AS duplicate_rank
            FROM auth."user" u
          )
          DELETE FROM auth."user" u
          USING ranked_users
          WHERE u.id = ranked_users.id
            AND ranked_users.duplicate_rank > 1;

          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE connamespace = 'auth'::regnamespace
              AND conrelid = 'auth."user"'::regclass
              AND conname = 'user_email_key'
          ) THEN
            ALTER TABLE auth."user"
              ADD CONSTRAINT user_email_key UNIQUE (email);
          END IF;

          CREATE UNIQUE INDEX IF NOT EXISTS user_email_lower_key
            ON auth."user" (lower(email));
        END IF;
      END
      $$;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('auth.session') IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'auth'
              AND table_name = 'session'
              AND column_name = 'twoFactorVerified'
          ) THEN
            ALTER TABLE auth."session"
              ADD COLUMN "twoFactorVerified" boolean DEFAULT false;
          END IF;

          UPDATE auth."session"
          SET "twoFactorVerified" = false
          WHERE "twoFactorVerified" IS NULL;
        END IF;
      END
      $$;
    `);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[auth-service] failed to ensure auth schema", error);
  process.exit(1);
});
