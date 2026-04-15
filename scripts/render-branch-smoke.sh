#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://rinklink-branch-app.onrender.com}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-$BASE_URL}"
DISALLOWED_ORIGIN="${DISALLOWED_ORIGIN:-http://localhost:5173}"
BODY_FILE="${BODY_FILE:-/tmp/rinklink-render-smoke-body.txt}"
HEADERS_FILE="${HEADERS_FILE:-/tmp/rinklink-render-smoke-headers.txt}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

status_code() {
  local url="$1"
  shift
  curl --max-time 20 -sS -o "$BODY_FILE" -w '%{http_code}' "$@" "$url"
}

assert_status() {
  local expected="$1"
  local url="$2"
  shift 2
  local code
  code="$(status_code "$url" "$@")"
  if [[ "$code" != "$expected" ]]; then
    echo "Response body from $url:" >&2
    cat "$BODY_FILE" >&2 || true
    fail "expected status $expected from $url, got $code"
  fi
}

assert_not_status() {
  local unexpected="$1"
  local url="$2"
  shift 2
  local code
  code="$(status_code "$url" "$@")"
  if [[ "$code" == "$unexpected" ]]; then
    echo "Response body from $url:" >&2
    cat "$BODY_FILE" >&2 || true
    fail "unexpected status $unexpected from $url"
  fi
}

echo "==> health"
assert_status 200 "$BASE_URL/api/health"
grep -q '"status":"ok"' "$BODY_FILE" || fail "health response missing status=ok"

echo "==> jwks"
assert_status 200 "$BASE_URL/.well-known/jwks.json"
python3 - <<'PY'
import json, sys
from pathlib import Path
body = Path('/tmp/rinklink-render-smoke-body.txt').read_text()
payload = json.loads(body)
if not isinstance(payload.get("keys"), list):
    raise SystemExit("JWKS payload missing keys list")
print(f"jwks keys={len(payload['keys'])}")
PY

echo "==> disallowed localhost origin"
code="$(curl --max-time 20 -sS -o "$BODY_FILE" -D "$HEADERS_FILE" -w '%{http_code}' \
  -X OPTIONS \
  -H "Origin: $DISALLOWED_ORIGIN" \
  -H 'Access-Control-Request-Method: GET' \
  "$BASE_URL/api/me")"
if [[ "$code" != "400" ]]; then
  cat "$BODY_FILE" >&2 || true
  fail "expected 400 for disallowed CORS origin, got $code"
fi
grep -qi 'Disallowed CORS origin' "$BODY_FILE" || fail "disallowed origin response missing expected message"

echo "==> allowed app origin"
code="$(curl --max-time 20 -sS -o "$BODY_FILE" -D "$HEADERS_FILE" -w '%{http_code}' \
  -X OPTIONS \
  -H "Origin: $ALLOWED_ORIGIN" \
  -H 'Access-Control-Request-Method: GET' \
  "$BASE_URL/api/me")"
if [[ "$code" != "200" ]]; then
  cat "$BODY_FILE" >&2 || true
  fail "expected 200 for allowed CORS origin, got $code"
fi
tr -d '\r' < "$HEADERS_FILE" | grep -qi "^access-control-allow-origin: $ALLOWED_ORIGIN\$" || fail "allowed origin header missing"

echo "==> auth token without cookie"
assert_status 401 "$BASE_URL/api/auth/token" -H 'Accept: application/json'

echo "==> security auth proxy routes are reachable"
assert_not_status 404 "$BASE_URL/api/auth/list-accounts" -H 'Accept: application/json'
assert_not_status 404 "$BASE_URL/api/auth/list-sessions" -H 'Accept: application/json'

echo "==> unknown auth route stays blocked"
assert_status 404 "$BASE_URL/api/auth/not-a-real-route" -H 'Accept: application/json'

echo "==> settings security page shell"
assert_status 200 "$BASE_URL/settings/security" -H 'Accept: text/html'
grep -qi '<html' "$BODY_FILE" || fail "settings/security did not return html"

echo
echo "Render branch smoke passed for $BASE_URL"
