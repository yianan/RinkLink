from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="RinkLink", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Routers imported after app creation to avoid circular imports
from .routers import associations, teams, schedules, search, proposals, rinks, seed as seed_router  # noqa: E402

app.include_router(associations.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(proposals.router, prefix="/api")
app.include_router(rinks.router, prefix="/api")
app.include_router(seed_router.router, prefix="/api")
