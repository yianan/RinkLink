import "dotenv/config";

import { Client } from "pg";

const databaseUrl = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to ensure the auth schema");
}

const client = new Client({
  connectionString: databaseUrl,
});

async function main() {
  await client.connect();
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS auth");
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
