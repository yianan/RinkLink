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
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[auth-service] failed to ensure auth schema", error);
  process.exit(1);
});
