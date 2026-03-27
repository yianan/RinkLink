# RinkLink

RinkLink is a youth hockey scheduling application built around five core concepts:

- `Availability` for open home/away scheduling windows
- `Schedule` for actual games, practices, and scrimmages
- `Arenas` for venue administration
- `Proposals` for opponent matching and scheduling offers
- `Scoresheets` for in-game scoring, penalties, goalie stats, and signatures

## Stack

- Backend: FastAPI + SQLAlchemy
- Database: SQLite locally, PostgreSQL in cloud
- Frontend: React + TypeScript + Vite + Tailwind
- Schema management: Alembic
- Frontend hosting: Render
- Cloud database: Neon PostgreSQL

## Local Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Defaults:

- `DATABASE_URL`: `sqlite:///backend/rinklink.db`
- `MEDIA_ROOT`: `backend/media`
- `CORS_ORIGINS`: `http://localhost:5173,http://localhost:5174`

Important:

- The app no longer creates or alters tables on startup.
- If you have an older local SQLite file from a pre-redesign build, delete it and rerun `alembic upgrade head`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` to `http://localhost:8000`.

### Seed Demo Data

```bash
curl -X POST http://localhost:8000/api/seed
```

Or use `Reset Demo Data` from the dashboard.

## Current Migration Lineage

The original Alembic history is preserved.

- Previous head before the redesign: `7f2b6c8a91d3`
- Current head: `092fd6e43b19`
- Forward redesign migration: `backend/alembic/versions/092fd6e43b19_arena_availability_events_redesign.py`

Important:

- The redesign migration is intentionally destructive.
- It preserves Alembic continuity for deployed databases, but it resets legacy application tables to the new arena / availability / events schema.
- That matches the current product decision: move forward to the new model without preserving old schedule / games / rinks data.

## Migration Workflow

All schema changes must go through Alembic. Do not rely on startup code to create tables or add columns.

### Standard workflow

1. Update the SQLAlchemy models in `backend/app/models/`.
2. Generate a migration:

```bash
cd backend
alembic revision --autogenerate -m "describe the change"
```

3. Review the generated file in `backend/alembic/versions/`.
4. Apply it locally:

```bash
alembic upgrade head
```

5. Confirm there is no schema drift:

```bash
alembic check
```

6. Commit both the model changes and the migration file together.

### Useful commands

| Command | Purpose |
|---|---|
| `alembic upgrade head` | Apply all pending migrations |
| `alembic downgrade -1` | Roll back one migration |
| `alembic current` | Show the DB's current revision |
| `alembic heads` | Show the latest revision(s) |
| `alembic history` | Show migration history |
| `alembic check` | Verify the database matches the models |

### Deployment rule

The backend deployment must always start from:

```bash
alembic upgrade head
```

If you containerize the backend, the start command should continue to do this before launching Uvicorn.

## Cloud Deployment

Current cloud shape:

1. Frontend on Render
2. PostgreSQL on Neon
3. Backend deployed from this repo and pointed at Neon via `DATABASE_URL`
4. Persistent media storage for uploaded logos via `MEDIA_ROOT`

### Required environment

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection URL | Primary application database |
| `MEDIA_ROOT` | `/var/data/rinklink-media` | Persistent storage for uploaded logos |
| `CORS_ORIGINS` | `https://your-frontend.onrender.com` | Browser origins allowed to call the API |

### Why `MEDIA_ROOT` matters

Bundled demo logos ship in the repository, but uploaded team / arena / association logos must not live on the container filesystem. Containers are replaceable; persistent disks are not.

Use a Render disk mount and point `MEDIA_ROOT` at that mount path.

### First cloud deploy

1. Create a Neon Postgres database.
2. Provision persistent filesystem storage for uploaded media wherever the backend runs.
3. Set:
   - `DATABASE_URL` to the Neon connection URL
   - `MEDIA_ROOT` to the mounted media path
   - `CORS_ORIGINS` to the Render frontend URL
4. Deploy the backend service.

```bash
alembic upgrade head
```

If your backend is running on Render, the existing Docker start command already does this automatically during boot:

```bash
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

That is the same core mechanism as before:

- Render rebuilds on push
- the backend container starts
- startup runs `alembic upgrade head`
- Alembic reads `DATABASE_URL`
- `DATABASE_URL` is normalized to a psycopg-backed Postgres URL when needed
- migrations apply to Neon instead of local SQLite

### Existing local SQLite does not migrate to cloud automatically

The local SQLite database is only for development. Cloud should use Neon Postgres and the Alembic migration chain.

If you ever want to move real data from local SQLite into Postgres, that is a separate data migration/export task, not something Alembic handles.

## Project Structure

```text
RinkLink/
├── Dockerfile
├── .dockerignore
├── README.md
├── backend/
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models/
│   │   ├── routers/
│   │   ├── schemas/
│   │   └── services/
│   ├── media/
│   └── requirements.txt
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
```
