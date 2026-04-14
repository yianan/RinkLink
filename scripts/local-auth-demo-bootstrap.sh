#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AUTH_BASE="${AUTH_BASE:-http://localhost:3000}"
API_BASE="${API_BASE:-http://localhost:8000}"
MAILPIT_BASE="${MAILPIT_BASE:-http://localhost:8025}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
PASSWORD="${PASSWORD:-RinkLinkLocal!7Q2x}"
EMAIL="${1:-local-admin-$(date +%s)@example.com}"
NAME="${NAME:-Local Admin}"
DB_CONTAINER="${DB_CONTAINER:-rinklink-postgres}"
DB_NAME="${DB_NAME:-rinklink}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
PSQL_BIN="${PSQL_BIN:-}"

resolve_psql_bin() {
  if [[ -n "${PSQL_BIN}" ]]; then
    printf '%s\n' "${PSQL_BIN}"
    return
  fi
  if command -v psql >/dev/null 2>&1; then
    command -v psql
    return
  fi
  if [[ -x "/Applications/Postgres.app/Contents/Versions/18/bin/psql" ]]; then
    printf '%s\n' "/Applications/Postgres.app/Contents/Versions/18/bin/psql"
    return
  fi
  echo "psql was not found and docker is unavailable" >&2
  exit 1
}

extract_cookie() {
  python3 -c 'import re, sys; headers = sys.stdin.read(); match = re.search(r"^set-cookie:\s*(better-auth\.session_token=[^;]+)", headers, re.IGNORECASE | re.MULTILINE); print(match.group(1) if match else "")'
}

extract_status() {
  awk 'NR==1 { print $2 }'
}

extract_body() {
  python3 -c 'import sys; response = sys.stdin.read(); sep = "\r\n\r\n" if "\r\n\r\n" in response else "\n\n"; print(response.split(sep, 1)[1] if sep in response else response, end="")'
}

find_verify_url() {
  RINKLINK_BOOTSTRAP_EMAIL="${EMAIL}" MAILPIT_BASE="${MAILPIT_BASE}" python3 <<'PY'
import os
import re
import urllib.parse
import urllib.request

email = os.environ["RINKLINK_BOOTSTRAP_EMAIL"]
mailpit_base = os.environ["MAILPIT_BASE"].rstrip("/")
query = urllib.parse.quote(f"to:{email}")
try:
    with urllib.request.urlopen(f"{mailpit_base}/view/latest.txt?query={query}", timeout=5) as response:
        body = response.read().decode()
except Exception:
    body = ""
pattern = re.compile(r"https?://\S+")
urls = pattern.findall(body)
print(urls[0] if urls else "")
PY
}

echo "==> ensuring auth user exists for ${EMAIL}"
signup_response="$(
  curl -i -sS \
    -H "Origin: ${ORIGIN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${NAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
    "${AUTH_BASE}/api/auth/sign-up/email"
)"
signup_status="$(printf '%s' "${signup_response}" | head -n 1 | awk '{print $2}')"
session_cookie=""

if [[ "${signup_status}" == "200" ]]; then
  echo "==> locating verification URL in Mailpit"
  verify_url=""
  for _ in {1..10}; do
    verify_url="$(find_verify_url)"
    if [[ -n "${verify_url}" ]]; then
      break
    fi
    sleep 1
  done

  if [[ -z "${verify_url}" ]]; then
    echo "verification URL was not found in Mailpit" >&2
    exit 1
  fi

  echo "==> verifying email"
  verify_response="$(curl -i -sS "${verify_url}")"
  session_cookie="$(printf '%s' "${verify_response}" | extract_cookie)"
else
  echo "==> sign-up returned ${signup_status}, attempting sign-in instead"
  signin_response="$(
    curl -i -sS \
      -H "Origin: ${ORIGIN}" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
      "${AUTH_BASE}/api/auth/sign-in/email"
  )"
  signin_status="$(printf '%s' "${signin_response}" | head -n 1 | awk '{print $2}')"
  if [[ "${signin_status}" != "200" ]]; then
    printf '%s\n' "${signup_response}"
    printf '%s\n' "${signin_response}"
    echo "unable to sign up or sign in bootstrap user" >&2
    exit 1
  fi
  session_cookie="$(printf '%s' "${signin_response}" | extract_cookie)"
fi

if [[ -z "${session_cookie}" ]]; then
  echo "session cookie was not found in auth response" >&2
  exit 1
fi

enable_bootstrap_mfa() {
  if docker info >/dev/null 2>&1; then
    docker exec -e PGPASSWORD=postgres -i "${DB_CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<SQL
UPDATE auth."user"
SET "twoFactorEnabled" = TRUE,
    "updatedAt" = NOW()
WHERE lower(email) = lower('${EMAIL}');
SQL
    return
  fi

  "$(resolve_psql_bin)" -v ON_ERROR_STOP=1 -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<SQL
UPDATE auth."user"
SET "twoFactorEnabled" = TRUE,
    "updatedAt" = NOW()
WHERE lower(email) = lower('${EMAIL}');
SQL
}

echo "==> enabling local MFA marker for bootstrap user"
enable_bootstrap_mfa

echo "==> requesting FastAPI audience token"
token_json="$(
  curl -sS \
    -H "Cookie: ${session_cookie}" \
    "${AUTH_BASE}/api/auth/token"
)"
token="$(
  printf '%s' "${token_json}" | python3 -c 'import json, sys; payload = json.load(sys.stdin); print(payload.get("token", ""))'
)"

if [[ -z "${token}" ]]; then
  printf '%s\n' "${token_json}"
  echo "token exchange failed" >&2
  exit 1
fi

echo "==> creating app user row if needed"
curl -sS -H "Authorization: Bearer ${token}" "${API_BASE}/api/me" >/dev/null

promote_bootstrap_user() {
  if docker info >/dev/null 2>&1; then
    docker exec -e PGPASSWORD=postgres -i "${DB_CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<SQL
UPDATE app_users
SET status = 'active',
    is_platform_admin = TRUE,
    updated_at = NOW()
WHERE lower(email) = lower('${EMAIL}');
SQL
    return
  fi

  "$(resolve_psql_bin)" -v ON_ERROR_STOP=1 -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<SQL
UPDATE app_users
SET status = 'active',
    is_platform_admin = TRUE,
    updated_at = NOW()
WHERE lower(email) = lower('${EMAIL}');
SQL
}

echo "==> promoting bootstrap user to active platform admin"
promote_bootstrap_user

echo "==> seeding demo data"
seed_response_raw="$(
  curl -sS \
    -i \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    "${API_BASE}/api/seed"
)"
seed_status="$(printf '%s' "${seed_response_raw}" | extract_status)"
seed_response="$(printf '%s' "${seed_response_raw}" | extract_body)"

if [[ "${seed_status}" != "200" ]]; then
  printf '%s\n' "${seed_response_raw}"
  echo "demo seeding failed" >&2
  exit 1
fi

echo "==> restoring bootstrap user after destructive reseed"
curl -sS -H "Authorization: Bearer ${token}" "${API_BASE}/api/me" >/dev/null
promote_bootstrap_user
enable_bootstrap_mfa

echo "==> verifying admin profile"
me_response_raw="$(
  curl -sS \
    -i \
    -H "Authorization: Bearer ${token}" \
    "${API_BASE}/api/me"
)"
me_status="$(printf '%s' "${me_response_raw}" | extract_status)"
me_response="$(printf '%s' "${me_response_raw}" | extract_body)"

if [[ "${me_status}" != "200" ]]; then
  printf '%s\n' "${me_response_raw}"
  echo "bootstrap admin verification failed" >&2
  exit 1
fi

printf '%s\n' "${seed_response}" | python3 -c 'import json, sys; payload = json.load(sys.stdin); print("seeded:", payload.get("message", "ok"))'
printf '%s\n' "${me_response}" | python3 -c 'import json, sys; payload = json.load(sys.stdin); user = payload["user"]; print("admin=%s status=%s platform_admin=%s" % (user["email"], user["status"], user["is_platform_admin"]))'
echo "password=${PASSWORD}"
