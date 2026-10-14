# RinkLink — team matching and scheduling

This branch (`codex/team-matching-scheduling`) starts from the full application's deployed matching fix, `a0b3da8`. It provides a manager-facing version of RinkLink:

- Original dashboard showing upcoming games/practices, open availability and incoming proposals.
- Team profiles, manager contacts, age/level, optional ranking and home venue.
- Home/away availability, blocked periods and reviewed CSV import.
- Opponent search and automatic matches using full game duration, age/level, season and distance.
- Proposals, opposing-team acceptance, decline, cancellation and rescheduling history.
- One shared game on both teams' schedules after acceptance.
- Direct entry, editing and cancellation of games and practices arranged externally.
- Tokenised calendar subscriptions with stable event IDs.
- Platform administrators, team administrators and schedulers; team invitations, requests and revocation.
- Existing sign-in, email verification, password recovery, MFA/session settings and account closure.

There are no player/parent accounts, rosters, RSVP, scoresheets, scoring, standings, competition management, arena operators, ice inventory/pricing, booking requests or locker-room workflows. Venues retain their original profiles, contact fields, logos and rink names. RinkLink **does not reserve ice**.

## Database isolation

**Use a dedicated, empty database for this version. Do not point it at the full application's Neon database.**

The original Alembic history is preserved unchanged in `backend/alembic/`. The active minimal schema has its own baseline in `backend/alembic_minimal/`; `backend/alembic.ini` selects that directory. The schema contains only matching, scheduling and team-access tables.

Migrations and application startup reject a database with the old full-app tables or migration lineage. Production also requires `RINKLINK_VARIANT=minimal`. This branch does not delete or migrate the full application's data. Importing selected teams and schedules into a new database is a separate task.

`render.yaml` names a **separate** `rinklink-minimal-app` service and tracks this branch. It does not update `rinklink-branch-app`. Supply a new database URL and the new service's own authentication secret/origin.

## Local development

Use Node 20+ and Python 3.11+ with `backend/requirements.txt`.

```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m app.seed.demo
AUTH_ENABLED=false AUTH_BYPASS_DEV_ONLY=true uvicorn app.main:app --host 127.0.0.1 --port 8100
```

In another terminal:

```sh
cd frontend
npm ci
VITE_AUTH_ENABLED=false VITE_PROXY_API_TARGET=http://127.0.0.1:8100 npm run dev -- --port 5183
```

This explicit development bypass is a local administrator preview. Production rejects it. To test real sign-in and email, use the isolated Postgres/Better Auth/Mailpit stack:

```sh
docker compose -p rinklink-minimal up
```

Ports: frontend `5183`, API `8100`, auth `3100`, Postgres `55432`, Mailpit `8125` (SMTP `1125`). Containers and volumes are separate from the full app.

`python -m app.seed.demo` adds the original full-app demo universe for the retained domains: 18 teams, 9 arenas, 18 rinks, 27 profile logos, 84 seasonal availability windows, 68 games/practices and 14 proposals across two seasons. It also adds 18 upcoming full-game home/away windows for immediate matching. The seed is additive and idempotent: existing accounts, memberships, teams, venues and user-edited schedules are preserved. Fixture provenance is recorded in `backend/app/seed/fixtures/original_demo.json`; excluded domains and accounts are not imported. For real-auth development, create the initial platform administrator with the existing auth-service bootstrap mechanism (`RINKLINK_BOOTSTRAP_ADMIN_EMAIL`, `RINKLINK_BOOTSTRAP_ADMIN_PASSWORD`, `RINKLINK_BOOTSTRAP_ADMIN_NAME`).

## Behaviour

Home availability describes the complete proposed game interval. A 6–7pm home game matches an away team available 5–8pm. A 15-minute overlap does not match. Unspecified away bounds are unrestricted; home matches require a known positive duration. Matches omit past dates, conflicts and incompatible age/level/season entries. Distance is a straight-line postcode estimate; an explicit maximum distance excludes teams whose distance is unknown.

An initial proposal must fit both published windows. A revision negotiates a new interval, potentially outside the original windows; the existing game stays unchanged until the opposing team accepts. Withdrawing or declining a pending revision leaves that game intact. Cancelling an accepted game removes it from both calendars and reopens the original availability. PostgreSQL row locks and a unique active-pair constraint protect concurrent schedule changes.

Manually recorded games with an external opponent name appear on the recording team's calendar. Adding another registered team directly requires scheduling access to **both** teams; otherwise use a proposal. Editing an agreed game also requires a reschedule proposal.

Calendar URLs are private subscription links. Anyone with the link can read that team's schedule. Do not share them publicly.

## Validation

```sh
cd backend
python -m pytest tests -q
alembic upgrade head
alembic check
cd ../frontend
npm run lint
npm run build
node --test tests/compatibility.test.cjs
```

The domain suite is verified on SQLite and PostgreSQL and exercises matching, proposals, shared schedules, rescheduling/cancellation, conflicts, permissions, invitations, access approval, CSV import and database-isolation checks. Original authentication/configuration tests remain. Tests for removed domains were removed with those domains.

The included postcode reference covers the same 12 Chicago-area ZIP codes as the full application. Distances outside that dataset are shown as unavailable; broader geocoding is not implemented.

## Original visual design

The retained screens use the original frontend components, shared stylesheet, fixed header/sidebar, selectors, cards and dialogs from `a0b3da8`. The former replacement minimal layouts have been removed. Excluded routes and controls are omitted; simple manual time entry replaces ice inventory selection within the existing forms. `frontend/src/api/compatibility.ts` preserves those components' data contracts over the minimal API. Team and venue logos are database-backed, and venue contact fields remain available.

Visual verification used native sign-in with independent PostgreSQL fixtures and the original frontend at equal viewport dimensions. Real scheduling, practice editing, proposal acceptance/rescheduling, team profile updates and rink updates were exercised through the browser. Shared styling, Availability and Settings are unchanged from the original source.
