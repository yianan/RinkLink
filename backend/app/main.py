from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urljoin

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from starlette.responses import Response

from .config import settings
from .database import engine  # noqa: F401 — imported to ensure engine is initialised
from .auth.runtime import assert_auth_runtime_safe


@asynccontextmanager
async def lifespan(app: FastAPI):
    from . import models  # noqa: F401

    assert_auth_runtime_safe()
    yield


app = FastAPI(title="RinkLink", version="0.1.0", lifespan=lifespan)

cors_options: dict[str, object] = {
    "allow_origins": settings.cors_origins,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    "allow_headers": ["Authorization", "Content-Type", "Accept"],
}
if settings.app_env == "development":
    cors_options["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app.add_middleware(CORSMiddleware, **cors_options)


@app.get("/api/health")
def health():
    return {"status": "ok"}


_UPSTREAM_HEADER_EXCLUDES = {
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}

_AUTH_PROXY_ALLOWED_PREFIXES = (
    "account-info",
    "callback/",
    "change-email",
    "change-password",
    "delete-user",
    "delete-user/",
    "error",
    "forget-password",
    "get-session",
    "get-access-token",
    "link-social",
    "list-accounts",
    "list-sessions",
    "list-user-accounts",
    "ok",
    "passkey/",
    "request-password-reset",
    "refresh-token",
    "reset-password",
    "revoke-other-sessions",
    "revoke-session",
    "revoke-sessions",
    "send-verification-email",
    "set-password",
    "sign-in/",
    "sign-out",
    "sign-up/",
    "token",
    "two-factor/",
    "unlink-account",
    "update-user",
    "verify-email",
)


def _is_allowed_auth_proxy_path(path: str) -> bool:
    normalized = path.strip().lstrip("/")
    if not normalized or ".." in normalized:
        return False
    return any(
        normalized == prefix.rstrip("/") or normalized.startswith(prefix)
        for prefix in _AUTH_PROXY_ALLOWED_PREFIXES
    )


async def _proxy_auth_request(request: Request, upstream_path: str) -> Response:
    if not settings.auth_internal_base_url:
        raise HTTPException(status_code=503, detail="Auth proxy is not configured")

    normalized_path = upstream_path.lstrip("/")
    if normalized_path.startswith("api/auth/"):
        proxied_path = normalized_path.removeprefix("api/auth/")
        if not _is_allowed_auth_proxy_path(proxied_path):
            raise HTTPException(status_code=404, detail="Auth route not found")

    upstream_url = urljoin(f"{settings.auth_internal_base_url}/", upstream_path.lstrip("/"))
    if request.url.query:
        upstream_url = f"{upstream_url}?{request.url.query}"

    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in _UPSTREAM_HEADER_EXCLUDES
    }

    async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
        upstream_response = await client.request(
            method=request.method,
            url=upstream_url,
            headers=headers,
            content=await request.body(),
        )

    response = Response(
        content=upstream_response.content,
        status_code=upstream_response.status_code,
    )
    for key, value in upstream_response.headers.multi_items():
        if key.lower() in _UPSTREAM_HEADER_EXCLUDES:
            continue
        response.raw_headers.append((key.encode("latin-1"), value.encode("latin-1")))
    if normalized_path == "api/auth/token":
        response.headers["Cache-Control"] = "no-store, private"
        response.headers["Pragma"] = "no-cache"
    return response


@app.api_route("/api/auth/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"], include_in_schema=False)
async def auth_proxy(path: str, request: Request) -> Response:
    return await _proxy_auth_request(request, f"/api/auth/{path}")


@app.api_route("/.well-known/jwks.json", methods=["GET", "HEAD"], include_in_schema=False)
async def auth_jwks_proxy(request: Request) -> Response:
    return await _proxy_auth_request(request, "/.well-known/jwks.json")


# Routers imported after app creation to avoid circular imports
from .routers import (  # noqa: E402
    arenas,
    associations,
    availability,
    events,
    ice_booking_requests,
    teams,
    search,
    proposals,
    notifications,
    players,
    scoresheet,
    seasons,
    competitions,
    me,
    public,
    access,
    calendar,
    seed as seed_router,
)

app.include_router(arenas.router, prefix="/api")
app.include_router(associations.router, prefix="/api")
app.include_router(availability.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(ice_booking_requests.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(proposals.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(scoresheet.router, prefix="/api")
app.include_router(seasons.router, prefix="/api")
app.include_router(competitions.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(public.router, prefix="/api")
app.include_router(access.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(seed_router.router, prefix="/api")

# Serve the React SPA for all non-API routes (production only — only present in Docker image)
_STATIC = Path(__file__).parent.parent / "static"
if _STATIC.is_dir():
    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str):
        candidate = _STATIC / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        # Serve index.html with no-cache so browsers always get the latest
        html = (_STATIC / "index.html").read_text()
        return HTMLResponse(html, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
