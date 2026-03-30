#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AUTH_BASE="${AUTH_BASE:-http://localhost:3000}"
API_BASE="${API_BASE:-http://localhost:8000}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
PASSWORD="${PASSWORD:-Password123!}"
EMAIL="${1:-local-admin-$(date +%s)@example.com}"
NAME="${NAME:-Local Admin}"
DB_CONTAINER="${DB_CONTAINER:-rinklink-postgres}"
DB_NAME="${DB_NAME:-rinklink}"
DB_USER="${DB_USER:-postgres}"

extract_cookie() {
  python3 -c 'import re, sys; headers = sys.stdin.read(); match = re.search(r"^set-cookie:\s*(better-auth\.session_token=[^;]+)", headers, re.IGNORECASE | re.MULTILINE); print(match.group(1) if match else "")'
}

find_verify_url() {
  RINKLINK_BOOTSTRAP_EMAIL="${EMAIL}" RINKLINK_ROOT_DIR="${ROOT_DIR}" python3 <<'PY'
import os
import re
import subprocess

email = os.environ["RINKLINK_BOOTSTRAP_EMAIL"]
root_dir = os.environ["RINKLINK_ROOT_DIR"]
result = subprocess.run(
    ["docker", "compose", "logs", "--tail=200", "--no-color", "auth-service"],
    cwd=root_dir,
    capture_output=True,
    text=True,
    check=False,
)
pattern = re.compile(rf"Verify email for {re.escape(email)}: (http://\S+)")
urls = [m.group(1) for line in result.stdout.splitlines() for m in [pattern.search(line)] if m]
print(urls[-1] if urls else "")
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
  echo "==> locating verification URL in auth-service logs"
  verify_url=""
  for _ in {1..10}; do
    verify_url="$(find_verify_url)"
    if [[ -n "${verify_url}" ]]; then
      break
    fi
    sleep 1
  done

  if [[ -z "${verify_url}" ]]; then
    echo "verification URL was not found in auth-service logs" >&2
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
  docker exec -e PGPASSWORD=postgres -i "${DB_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" >/dev/null <<SQL
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
seed_response="$(
  curl -sS \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    "${API_BASE}/api/seed"
)"

echo "==> restoring bootstrap user after destructive reseed"
curl -sS -H "Authorization: Bearer ${token}" "${API_BASE}/api/me" >/dev/null
promote_bootstrap_user

echo "==> verifying admin profile"
me_response="$(
  curl -sS \
    -H "Authorization: Bearer ${token}" \
    "${API_BASE}/api/me"
)"

printf '%s\n' "${seed_response}" | python3 -c 'import json, sys; payload = json.load(sys.stdin); print("seeded:", payload.get("message", "ok"))'
printf '%s\n' "${me_response}" | python3 -c 'import json, sys; payload = json.load(sys.stdin); user = payload["user"]; print("admin=%s status=%s platform_admin=%s" % (user["email"], user["status"], user["is_platform_admin"]))'
echo "password=${PASSWORD}"
