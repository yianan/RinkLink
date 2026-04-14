#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DATABASE_URL_BASE:-}" ]; then
  DATABASE_URL="${DATABASE_URL_BASE}"
  export DATABASE_URL
fi

derive_auth_database_url() {
  node -e '
    const raw = (process.env.DATABASE_URL || "").trim();
    const schema = (process.env.AUTH_DATABASE_SCHEMA || "auth").trim() || "auth";
    if (!raw) {
      throw new Error("DATABASE_URL is required");
    }
    const url = new URL(raw);
    const hasSearchPath = url.searchParams.getAll("options").some((value) => value.includes("search_path"));
    if (!hasSearchPath) {
      url.searchParams.append("options", `-c search_path=${schema}`);
    }
    process.stdout.write(url.toString());
  '
}

PUBLIC_APP_URL="${PUBLIC_APP_URL:-${RENDER_EXTERNAL_URL:-${FRONTEND_URL:-http://localhost:8000}}}"
AUTH_INTERNAL_BASE_URL="${AUTH_INTERNAL_BASE_URL:-http://127.0.0.1:3000}"
AUTH_SERVICE_PORT="${AUTH_SERVICE_PORT:-3000}"
APP_PORT="${PORT:-8000}"
AUTH_DATABASE_URL="${AUTH_DATABASE_URL:-$(derive_auth_database_url)}"
API_AUDIENCE="${API_AUDIENCE:-rinklink-api}"
BETTER_AUTH_URL="${BETTER_AUTH_URL:-$PUBLIC_APP_URL}"
FRONTEND_URL="${FRONTEND_URL:-$PUBLIC_APP_URL}"
AUTH_JWKS_URL="${AUTH_JWKS_URL:-$PUBLIC_APP_URL/.well-known/jwks.json}"
AUTH_ISSUER="${AUTH_ISSUER:-$PUBLIC_APP_URL}"
AUTH_AUDIENCE="${AUTH_AUDIENCE:-$API_AUDIENCE}"

export PUBLIC_APP_URL AUTH_INTERNAL_BASE_URL AUTH_SERVICE_PORT AUTH_DATABASE_URL API_AUDIENCE BETTER_AUTH_URL FRONTEND_URL AUTH_JWKS_URL AUTH_ISSUER AUTH_AUDIENCE

cd /app/auth-service
node dist/ensure-auth-schema.js
npm run auth:migrate:compiled:yes
PORT="$AUTH_SERVICE_PORT" node dist/index.js &
AUTH_PID=$!

cd /app/backend
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port "$APP_PORT" &
API_PID=$!

cleanup() {
  kill "$AUTH_PID" "$API_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

while kill -0 "$AUTH_PID" 2>/dev/null && kill -0 "$API_PID" 2>/dev/null; do
  sleep 1
done

wait "$AUTH_PID" || true
wait "$API_PID" || true
