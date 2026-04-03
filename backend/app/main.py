from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from .config import settings
from .database import engine  # noqa: F401 — imported to ensure engine is initialised
from .auth.runtime import assert_auth_runtime_safe
from .services.arena_logos import ensure_arena_logo_dir
from .services.association_logos import ensure_association_logo_dir
from .services.team_logos import ensure_team_logo_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    from . import models  # noqa: F401

    assert_auth_runtime_safe()
    ensure_team_logo_dir()
    ensure_arena_logo_dir()
    ensure_association_logo_dir()
    yield


app = FastAPI(title="RinkLink", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


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
