#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DATABASE_URL_BASE:-}" ]; then
  DATABASE_URL="$(node -e '
    const raw = (process.env.DATABASE_URL_BASE || "").trim();
    const schema = (process.env.DATABASE_SCHEMA || "auth").trim() || "auth";
    if (!raw) {
      throw new Error("DATABASE_URL_BASE is required when DATABASE_URL is not set");
    }
    const url = new URL(raw);
    const hasSearchPath = url.searchParams.getAll("options").some((value) => value.includes("search_path"));
    if (!hasSearchPath) {
      url.searchParams.append("options", `-c search_path=${schema}`);
    }
    process.stdout.write(url.toString());
  ')"
  export DATABASE_URL
fi

npm run start:compiled
