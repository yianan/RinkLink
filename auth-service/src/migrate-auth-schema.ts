import "dotenv/config";

import { getMigrations } from "better-auth/db/migration";

import { authOptions, pool } from "./auth.js";

async function main() {
  const { runMigrations } = await getMigrations(authOptions);
  await runMigrations();
}

main()
  .catch((error) => {
    console.error("[auth-service] failed to migrate auth schema", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
