# RinkLink

RinkLink is a youth hockey scheduling application built around five core concepts:

- `Availability` for open home/away scheduling windows
- `Schedule` for actual games, practices, and scrimmages
- `Arenas` for venue administration
- `Ice Booking Requests` for team requests against priced open ice
- `Proposals` for opponent matching and scheduling offers
- `Scoresheets` for in-game scoring, penalties, goalie stats, and signatures

## Stack

- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL locally and in cloud for auth-enabled development; SQLite remains available only as a fallback for isolated backend work
- Frontend: React + TypeScript + Vite + Tailwind
- Schema management: Alembic
- Frontend hosting: Render
- Cloud database: Neon PostgreSQL

## Local Development

### Preferred local stack

Auth implementation work uses a shared local Postgres instance and a dedicated auth service so local behavior matches Neon-backed production more closely.

Start the shared services from the repo root:

```bash
docker compose up postgres auth-service backend
```

The auth service runs Better Auth schema migrations automatically during startup.

This starts:

- Postgres on `localhost:5432`
- Better Auth service on `http://localhost:3000`
- FastAPI backend on `http://localhost:8000`

Then run the frontend separately:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

Local env examples:

- `backend/.env.example`
- `auth-service/.env.example`
- `frontend/.env.example`

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

- `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/rinklink`
- `MEDIA_ROOT`: `backend/media`
- `CORS_ORIGINS`: `http://localhost:5173,http://localhost:5174`
- `AUTH_ENABLED`: `true`
- `AUTH_JWKS_URL`: `http://localhost:3000/.well-known/jwks.json`
- `AUTH_ISSUER`: `http://localhost:3000`
- `AUTH_AUDIENCE`: `http://localhost:8000`

Important:

- The app no longer creates or alters tables on startup.
- SQLite is still supported as a fallback for isolated backend development, but auth implementation work should use the shared local Postgres setup above.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and proxies `/api` to `http://localhost:8000`.

### Auth Service

```bash
cd auth-service
npm install
npm run dev
```

Important local URLs:

- Better Auth base URL: `http://localhost:3000`
- Better Auth routes: `http://localhost:3000/api/auth/*`
- JWKS URL: `http://localhost:3000/.well-known/jwks.json`

### Minimal local auth smoke flow

Once `postgres`, `auth-service`, and `backend` are running, you can verify the auth bridge without the frontend:

```bash
./scripts/local-auth-smoke.sh
```

The script does all of the following against the local stack:

- sign up a new Better Auth user
- read the verification URL from `auth-service` logs
- verify the email and capture the Better Auth session cookie
- exchange that session for a FastAPI audience JWT
- call `GET /api/me`

The first authenticated `/api/me` response should create an `app_users` row automatically and return a `pending` user profile until that user is granted memberships or activated.

### Seed Demo Data

```bash
curl -X POST http://localhost:8000/api/seed
```

Or use `Reset Demo Data` from the dashboard.

## Current Migration Lineage

The original Alembic history is preserved.

- Previous head before the redesign: `7f2b6c8a91d3`
- Current head: `c4b9a5930f12`
- Forward redesign migration: `backend/alembic/versions/092fd6e43b19_arena_availability_events_redesign.py`
- Attendance migration: `backend/alembic/versions/7b6a6c0f4d21_add_event_attendance.py`
- Open-ice pricing and booking-request migration: `backend/alembic/versions/c4b9a5930f12_add_ice_booking_requests_and_slot_pricing.py`

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

Current examples of post-redesign migrations in this repo:
- attendance tracking on events
- priced ice slots
- arena-side ice booking requests with accept / reject / cancel flow

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
