# RinkLink

Youth hockey scheduling app for finding opponents, managing games, and booking practice ice time.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite (local) / PostgreSQL (production)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Migrations**: Alembic
- **Deployment**: Render (backend + frontend served together via Docker)

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
2. View the schedule — open dates show **Find Opponents** and **Block/Unblock** buttons
3. Search for opponents (**Find Opponents** page, or click directly from an open date)
4. Propose a game from search results
5. Switch to the opponent team and accept the proposal (**Proposals** page)
6. View the accepted game on the **Games** page; set its type (League / Non-League / Tournament)
7. Confirm the game is happening this week on the **Weekly Confirm** page
8. Fill in the scoresheet on the **Game** detail page (stats, penalties, goalie stats, signatures)
9. Book practice ice on the **Practice** page (browse rinks → available ice slots → Book)

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

## Deployment (Render)

The app is deployed as a single Render Web Service (FastAPI serves the built React app as static files) backed by a Render-managed Postgres database.

### Architecture

```
Browser
  └── Render service URL
        ├── GET /api/*   → FastAPI handles the request
        └── GET /*       → FastAPI serves the built React SPA (index.html)

FastAPI
  └── Render Postgres (DATABASE_URL set in environment)
```

### First-time Render setup

1. **Push to GitHub** (the remote is already configured).

2. **Create a Web Service on Render**
   - Go to [render.com](https://render.com) → **New** → **Web Service** → connect this repo.
   - Set **Runtime** to **Docker** — Render will use the `Dockerfile` automatically.

3. **Add Postgres**
   - Create a **Render PostgreSQL** database and copy its **Internal Database URL**.
   - Add it as an environment variable `DATABASE_URL` on the Web Service.

4. **First deploy**
   - Render builds the Docker image (Node stage builds React, Python stage installs deps and copies `dist/`).
   - On container start, `alembic upgrade head` runs to create all tables in the fresh Postgres DB.
   - The health check hits `/api/health`.

### Every subsequent deploy

```bash
git push origin main
```

Render rebuilds and redeploys automatically. If the push includes new migration files, `alembic upgrade head` applies them before uvicorn starts.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./rinklink.db` | Postgres URL from Render; falls back to SQLite locally |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` | Comma-separated allowed origins; not needed when frontend and backend share the same Render URL |

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
