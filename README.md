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
- Mailpit SMTP/web UI on `http://localhost:8025`

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
- `MEDIA_ROOT`: `backend/media` (legacy fallback only; new logo uploads are stored in Postgres)
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
- read the verification URL from Mailpit
- verify the email and capture the Better Auth session cookie
- exchange that session for a FastAPI audience JWT
- call `GET /api/me`

With the default Docker Compose stack, verification and invite emails are delivered to Mailpit instead of being logged to stdout.

The first authenticated `/api/me` response should create an `app_users` row automatically and return a `pending` user profile until that user is granted memberships or activated.

### Bootstrap a local admin and demo data

Because `/api/seed` now requires an authenticated active user, the easiest local/browser setup path is:

```bash
./scripts/local-auth-demo-bootstrap.sh
```

The bootstrap script:

- signs up or signs in a local Better Auth user
- verifies the email when it just created the account by reading the verification message from Mailpit
- exchanges the Better Auth session for a FastAPI JWT
- ensures the matching `app_users` row exists
- promotes that user to `active` + `platform_admin`
- calls `POST /api/seed`

This gives you a repeatable local admin account plus requestable demo data for pending-user and access-review browser testing.

### Seed Demo Data Manually

```bash
curl -X POST \
  -H "Authorization: Bearer <fastapi-jwt>" \
  http://localhost:8000/api/seed
```

Or use `Reset Demo Data` from the dashboard as an authenticated active admin.

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

1. One Render web service built from this repo
2. PostgreSQL on Neon
3. Better Auth running inside the same container on loopback
4. Uploaded and seeded logos stored in Postgres instead of on a Render disk

### Required environment

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | Neon Postgres connection URL | Primary application database |
| `EMAIL_FROM_ADDRESS` | `no-reply@example.com` | Verified Brevo sender address |
| `SMTP_USERNAME` | `your-brevo-smtp-login` | Brevo SMTP username |
| `SMTP_PASSWORD` | `your-brevo-smtp-key` | Brevo SMTP key |

### Branch dev sandbox on Render

This branch now supports a separate Render-hosted development sandbox while `main` stays live.

- The public app service stays the only browser-visible URL.
- The Better Auth service runs inside the same container on `127.0.0.1:3000` and is proxied through the app at `/api/auth/*`.
- Neon remains the database for both the app schema and the Better Auth `auth` schema.
- The branch app should run with `APP_ENV=development` so the dashboard `Reset Demo Data` button continues to work against the branch database.
- The hosted reset path is intentionally destructive for this sandbox, but it restores the triggering platform admin so the browser can reload back into a working session.
- Demo logos and uploaded logos are both stored in Postgres, so the branch sandbox does not require a Render disk.

The included `render.yaml` provisions:

- a single public Docker app service from the repo root
- env placeholders for Neon and Brevo secrets

Render-specific notes:

- the backend derives its public origin defaults from `RENDER_EXTERNAL_URL`
- the backend proxies Better Auth through `AUTH_INTERNAL_BASE_URL`, which defaults to `http://127.0.0.1:3000` in the single-service container
- the startup script derives `AUTH_DATABASE_URL` from `DATABASE_URL` by adding `search_path=auth`
- the Docker build sets `VITE_AUTH_ENABLED=true` for the hosted frontend build

### Initial branch bootstrap

After the branch service is deployed:

1. Sign up and verify the intended admin through the branch app URL.
2. Sign in once through the app so `/api/me` creates the matching `app_users` row.
3. Run a one-off command against the app service:

```bash
python -m app.seed.bootstrap_demo --admin-email you@example.com
```

That command:

- resets the branch database to the existing demo dataset
- restores the specified user as `active` + `platform_admin`
- leaves future `Reset Demo Data` actions available from the frontend for that branch sandbox

### First cloud deploy

1. Create or choose a Neon Postgres database or branch dedicated to this Render sandbox.
2. Set `DATABASE_URL` in Render to the Neon connection URL.
3. Set the Brevo SMTP credentials and verified sender values in Render.
4. Deploy the single Docker web service.

```bash
alembic upgrade head
```

If the app is running on Render, the combined container startup already does all of the following automatically:

```bash
node dist/ensure-auth-schema.js
npm run auth:migrate:yes
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

That means:

- Render rebuilds on push
- the single container starts both auth-service and FastAPI
- Better Auth ensures the `auth` schema and applies its migrations
- Alembic applies the app migrations
- `DATABASE_URL` is normalized to a psycopg-backed Postgres URL when needed
- both auth and app schemas live in Neon
- logo assets are loaded from Postgres, not from container disk

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
