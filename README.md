# RinkLink

Youth hockey scheduling app for finding opponents, managing games, and booking practice ice time.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite (local) / PostgreSQL (production)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Migrations**: Alembic
- **Deployment**: Railway (backend + frontend served together) + Railway Postgres

---

## Local Development

### 1. Backend

```bash
cd backend
pip install -r requirements.txt

# Apply any pending migrations (creates the DB on first run)
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
```

The backend reads `DATABASE_URL` from the environment. If not set it defaults to `sqlite:///./rinklink.db` in the `backend/` directory.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite starts on `http://localhost:5173` and proxies all `/api` requests to `http://localhost:8000`, so you never need to touch CORS or hardcoded URLs locally.

### 3. Seed demo data

Once both servers are running:

```bash
curl -X POST http://localhost:8000/api/seed
```

Or click **Seed Demo Data** on the homepage when no teams exist.

### 4. Test flow

1. Select a team via the team switcher dropdown
2. View the schedule (open dates are on the **Schedule** page)
3. Search for opponents (**Find Opponents** page)
4. Propose a game from search results
5. Switch to the opponent team
6. Accept the proposal (**Proposals** page)
7. Verify the schedule updates to reflect the accepted game
8. Book practice ice on the **Practice** page

---

## Database Migrations (Alembic)

Alembic manages all schema changes. **Never modify the database schema manually** — always go through a migration file so that both local SQLite and production Postgres stay in sync.

### How it works

- Every schema change is captured in a versioned Python file under `backend/alembic/versions/`.
- Each file has an `upgrade()` function (apply the change) and a `downgrade()` function (reverse it).
- Both local SQLite and Railway Postgres run the exact same migration files, in order.
- The `alembic_version` table in each database records which migrations have been applied, so Alembic never runs the same migration twice.

### Workflow for every model change

```
┌─────────────────────────────────┐
│  1. Edit the SQLAlchemy model   │
│     in backend/app/models/      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  2. Generate the migration      │
│                                 │
│  cd backend                     │
│  alembic revision \             │
│    --autogenerate \             │
│    -m "describe the change"     │
│                                 │
│  Alembic diffs your models      │
│  against the live DB and writes │
│  the SQL into a new file in     │
│  alembic/versions/              │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  3. Review the generated file   │
│                                 │
│  Open the new file in           │
│  alembic/versions/ and confirm  │
│  the upgrade() / downgrade()    │
│  SQL looks correct.             │
│  Autogenerate is good but not   │
│  perfect — always check.        │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  4. Apply locally               │
│                                 │
│  alembic upgrade head           │
│                                 │
│  Your local SQLite DB is now    │
│  up to date.                    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  5. Commit and push             │
│                                 │
│  git add alembic/versions/...   │
│  git commit -m "..."            │
│  git push                       │
│                                 │
│  Railway detects the push,      │
│  rebuilds the Docker image, and │
│  runs `alembic upgrade head`    │
│  before starting uvicorn.       │
│  Railway Postgres is now in     │
│  sync with your local DB.       │
└─────────────────────────────────┘
```

### Useful Alembic commands

| Command | What it does |
|---|---|
| `alembic upgrade head` | Apply all pending migrations |
| `alembic downgrade -1` | Roll back the last migration |
| `alembic current` | Show which revision the DB is at |
| `alembic history` | List all migrations in order |
| `alembic check` | Verify models and DB are in sync (no pending changes) |
| `alembic revision --autogenerate -m "..."` | Generate a new migration from model changes |
| `alembic stamp head` | Mark the DB as being at head **without running migrations** (used once when adopting Alembic on an existing DB) |

### What Alembic does NOT sync

Alembic syncs **schema** (tables, columns, indexes, constraints) — not **data**. Local SQLite and Railway Postgres are expected to have different data: local is throwaway test/seed data, Railway is production data.

---

## Deployment (Railway)

The app is deployed as a single Railway service (FastAPI serves the built React app as static files) plus a Railway-managed Postgres database.

### Architecture

```
Browser
  └── Railway service URL (e.g. rinklink-production.up.railway.app)
        ├── GET /api/*   → FastAPI handles the request
        └── GET /*       → FastAPI serves the built React SPA (index.html)

FastAPI
  └── Railway Postgres (DATABASE_URL injected automatically)
```

### First-time Railway setup

1. **Push to GitHub** (the remote is already configured).

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select this repo.
   - Railway detects `railway.toml` and `Dockerfile` automatically.

3. **Add Postgres**
   - Inside the Railway project: **+ New** → **Database** → **PostgreSQL**.
   - Railway injects `DATABASE_URL` into the service environment automatically — no manual configuration needed.

4. **First deploy**
   - Railway builds the Docker image (Node stage builds React, Python stage installs deps and copies the `dist/`).
   - On startup the container runs `alembic upgrade head`, which creates all tables in the fresh Postgres DB.
   - The health check hits `/api/health` to confirm everything is live.

### Every subsequent deploy

```bash
git push origin main
```

Railway rebuilds and redeploys automatically. If the push includes new migration files, `alembic upgrade head` applies them to Postgres before uvicorn starts. Zero manual steps.

### Environment variables

Railway sets `DATABASE_URL` automatically when a Postgres service is linked. You can optionally set:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./rinklink.db` | Set automatically by Railway Postgres |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Comma-separated list of allowed origins; not needed when frontend and backend share the same Railway URL |

---

## Project Structure

```
RinkLink/
├── Dockerfile              # Multi-stage build: Node (React) → Python (FastAPI)
├── railway.toml            # Railway build + deploy config
├── .dockerignore
├── backend/
│   ├── alembic.ini         # Alembic config (DB URL is set from env, not here)
│   ├── alembic/
│   │   ├── env.py          # Wires Alembic to settings.database_url + all models
│   │   └── versions/       # One file per migration — commit every file
│   ├── requirements.txt
│   └── app/
│       ├── config.py       # Reads DATABASE_URL + CORS_ORIGINS from environment
│       ├── database.py     # SQLAlchemy engine (SQLite pragma applied only locally)
│       ├── main.py         # FastAPI app + SPA catch-all for production static files
│       ├── models/         # SQLAlchemy models — source of truth for the schema
│       ├── routers/        # One file per resource
│       └── schemas/        # Pydantic request/response models
└── frontend/
    ├── vite.config.ts      # Proxies /api → localhost:8000 in dev
    └── src/
        ├── api/client.ts   # All API calls — uses relative /api URL
        ├── types/index.ts  # TypeScript interfaces mirroring backend schemas
        └── pages/          # One file per page/route
```
