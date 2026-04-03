#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AUTH_BASE="${AUTH_BASE:-http://localhost:3000}"
API_BASE="${API_BASE:-http://localhost:8000}"
MAILPIT_BASE="${MAILPIT_BASE:-http://localhost:8025}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
PASSWORD="${PASSWORD:-Password123!}"
EMAIL="${1:-local-smoke-$(date +%s)@example.com}"
NAME="${NAME:-Local Smoke}"

echo "==> signing up ${EMAIL}"
signup_response="$(
  curl -i -sS \
    -H "Origin: ${ORIGIN}" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${NAME}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" \
    "${AUTH_BASE}/api/auth/sign-up/email"
)"

signup_status="$(printf '%s' "${signup_response}" | head -n 1 | awk '{print $2}')"
if [[ "${signup_status}" != "200" ]]; then
  printf '%s\n' "${signup_response}"
  echo "sign-up failed" >&2
  exit 1
fi

echo "==> locating verification URL in Mailpit"
verify_url=""
for _ in {1..10}; do
  verify_url="$(
    RINKLINK_SMOKE_EMAIL="${EMAIL}" MAILPIT_BASE="${MAILPIT_BASE}" python3 <<'PY'
import os
import re
import urllib.parse
import urllib.request

email = os.environ["RINKLINK_SMOKE_EMAIL"]
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
  )"
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
session_cookie="$(
  printf '%s' "${verify_response}" | python3 -c 'import re, sys; headers = sys.stdin.read(); match = re.search(r"^set-cookie:\s*(better-auth\.session_token=[^;]+)", headers, re.IGNORECASE | re.MULTILINE); print(match.group(1) if match else "")'
)"

if [[ -z "${session_cookie}" ]]; then
  echo "session cookie was not found in verify-email response" >&2
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

echo "==> calling /api/me"
curl -sS \
  -H "Authorization: Bearer ${token}" \
  "${API_BASE}/api/me"
echo
