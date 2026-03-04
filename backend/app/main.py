from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import settings
from .database import engine  # noqa: F401 — imported to ensure engine is initialised


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield  # schema managed by Alembic migrations, not create_all


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
    associations,
    teams,
    schedules,
    search,
    proposals,
    rinks,
    games,
    notifications,
    players,
    scoresheet,
    practice_bookings,
    seed as seed_router,
)

app.include_router(associations.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(proposals.router, prefix="/api")
app.include_router(rinks.router, prefix="/api")
app.include_router(games.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(scoresheet.router, prefix="/api")
app.include_router(practice_bookings.router, prefix="/api")
app.include_router(seed_router.router, prefix="/api")

# Serve the React SPA for all non-API routes (production only — only present in Docker image)
_STATIC = Path(__file__).parent.parent / "static"
if _STATIC.is_dir():
    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str):
        candidate = _STATIC / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_STATIC / "index.html"))
