# Auth Implementation Progress

## Branch

- `codex/auth-foundation`

## Working Spec

- `docs/auth-implementation-plan.md`
- `docs/auth-architecture-plan.md`

## Checkpoints

### 2026-03-29

- Started implementation on `codex/auth-foundation`.
- Confirmed execution will proceed in local-only commits with no remote push.
- Established progress log to record implementation slices and decisions.
- Added the first implementation slice:
  - shared local Postgres via `docker-compose.yml`
  - local auth schema bootstrap SQL
  - backend, frontend, and auth-service env examples
  - auth-service scaffold with Better Auth, JWT plugin, Postgres wiring, and JWKS route
  - README updates for the auth-aware local workflow
- Validation:
  - `npm install` succeeded in `auth-service/`
  - `npm run build` succeeded in `auth-service/`
  - `docker compose config` succeeded for the local stack
- Added backend auth foundation:
  - backend auth config fields in `app.config`
  - authorization models for users, memberships, invites, access requests, and audit log
  - Alembic migration for the new auth tables
- Validation:
  - backend auth models compile via `./.venv/bin/python -m compileall app`
  - `./.venv/bin/alembic upgrade head` succeeded
  - `./.venv/bin/alembic check` reports no schema drift
- Added backend auth runtime foundation:
  - Better Auth JWT validation support dependencies
  - runtime auth safety checks
  - JWKS fetch and cache utility
  - JWT decode utility
  - capability mapping module
  - `current_user` and `require_active_user` dependencies
  - `/api/me` router and auth schemas
- Validation:
  - backend dependencies installed successfully in `.venv`
  - `./.venv/bin/python -m compileall app` succeeded with auth modules
  - `./.venv/bin/python -c "from app.main import app; print('ok')"` succeeded
- Added first protected app integration slice:
  - shared backend authorization context for memberships, linked players, and effective capabilities
  - `/api/me` refactored onto the shared authorization context
  - `teams` router now enforces scoped reads and write capabilities
  - `players` router now enforces private roster reads and roster-management writes
  - frontend Better Auth client scaffold
  - cached auth-service `/api/auth/token` bridge for FastAPI Bearer tokens
  - auth-aware API request wrapper with silent token refresh on `401`
  - frontend `AuthContext` and auth-gated `TeamContext` bootstrap
- Validation:
  - backend imports cleanly after route protection via `./.venv/bin/python -c "from app.main import app; print('backend ok')"`
  - frontend `npm install` succeeded with the Better Auth client dependency
  - frontend `npm run build` succeeded with the auth client/context changes
- Added the second protected router slice:
  - arena, event, proposal, and availability helper checks in the shared backend auth context
  - `availability` router now enforces `team.manage_schedule`
  - `events` router now enforces scoped event reads, attendance permissions, schedule edits, and weekly confirmation permissions
  - `proposals` router now enforces proposal ownership/counterparty permissions and validates that proposal windows match the selected teams
  - `scoresheet` router now enforces `team.view_private` for reads and `team.manage_scoresheet` for writes
- Validation:
  - `./.venv/bin/python -m compileall app` succeeded after the second router protection pass
  - `./.venv/bin/python -c "from app.main import app; print('ok')"` succeeded after wiring the new authorization helpers
- Added the third protected router slice:
  - `notifications` router now enforces team-scoped reads and read acknowledgements
  - `search` router now enforces proposal-management access on the requesting team
  - `ice_booking_requests` router now enforces team scheduling permissions and arena booking-request permissions
  - `arenas` router now enforces read-vs-manage-vs-slot-operation access across arenas, rinks, locker rooms, and ice slots
  - `associations` router now enforces scoped association reads and platform-only destructive operations
  - `competitions` and `seasons` endpoints now require an authenticated active user, with team membership checks on team-specific competition lookups
  - `seed` endpoint is now auth-gated and limited to development only
- Validation:
  - `./.venv/bin/python -m compileall app` succeeded after the admin and ops protection pass
  - `./.venv/bin/python -c "from app.main import app; print('ok')"` succeeded after protecting admin and utility routers
- Added the first auth UI slice:
  - `/api/me` now supports authenticated pending users so the frontend can render approval status correctly
  - BrowserRouter moved to the app entrypoint to support Better Auth UI’s React Router integration
  - added `@daveyplate/better-auth-ui` and wired `AuthUIProvider`
  - added `AuthView`-backed auth routing at `/auth/:pathname`
  - kept `PendingApprovalPage` custom, per plan, for approval-state UX
  - added authenticated shell redirects for unauthenticated users, pending users, and profile-load failures
  - added a simple authenticated sign-out action in the app shell
- Validation:
  - `./.venv/bin/python -m compileall app` succeeded after the pending-user `/api/me` change
  - `./.venv/bin/python -c "from app.main import app; print('ok')"` succeeded after the auth UI backend dependency change
  - `npm install @daveyplate/better-auth-ui@latest` succeeded
  - `npm run build` succeeded with `AuthUIProvider`, `AuthView`, and the protected auth routing changes
- Added the first custom app-owned onboarding slice on top of Better Auth UI:
  - backend invite and access-request schemas
  - new `/api/invites` and `/api/access-requests` router with target validation, resource-scoped authorization, membership/link grants, and audit log writes
  - custom invite review/acceptance page at `/invite/:token`
  - pending approval page now loads and displays invites plus submitted access requests
  - added authenticated return-to handling so invite links survive the sign-in round trip
- Validation:
  - `./.venv/bin/python -m compileall app` succeeded after the access router addition
  - `./.venv/bin/python -c "from app.main import app; print('ok')"` succeeded with the invite/access-request router wired into FastAPI
  - `npm run build` succeeded with the new invite acceptance and pending approval flows
- Added the first reviewer/admin UI slice:
  - new `/access` page for managed invites and reviewable access requests
  - role selection for approving team, association, and arena access requests
  - invite-link copy and cancel actions for managed invites
  - capability-based navigation filtering so the frontend no longer shows the same nav to every persona
- Validation:
  - `npm run build` succeeded after adding the access management page and capability-based nav filtering
- Expanded the access management page into the first full admin workflow:
  - invite creation form for association, team, arena, guardian, and player link invites
  - role selection for role-bearing invite targets
  - team-scoped player lookup for guardian/player invites
  - invite creation now lives in-app instead of requiring direct API usage
- Validation:
  - `npm run build` succeeded after the access-page invite creation workflow was added

## Planned Commit Sequence

1. Local auth/dev foundation:
   - Docker Compose
   - env examples
   - README updates
2. Auth service scaffold:
   - package manifest
   - Better Auth config
   - Postgres wiring
   - JWKS endpoint foundation
3. Backend auth foundation:
   - config
   - auth modules
   - models
   - Alembic migration
4. Initial protected app integration:
   - `/api/me`
   - auth dependencies
   - first protected routes
5. Auth-aware frontend foundation:
   - Better Auth client
   - auth token bridge
   - `/api/me` consumption context
   - auth-gated team bootstrap
6. Expanded protected backend coverage:
   - availability
   - events
   - proposals
   - scoresheet
7. Remaining admin and utility coverage:
   - arenas
   - associations
   - booking requests
   - notifications
   - search
   - seed hardening
8. Commodity auth UI integration:
   - Better Auth UI provider
   - auth routes
   - pending approval screen
   - app shell auth redirects
9. Custom onboarding and access flows:
   - invite review and acceptance
   - access request APIs
   - pending approval data surfaces
10. Reviewer/admin access management:
   - managed invites list
   - review queue UI
   - capability-aware nav filtering
11. Invite creation UI:
   - association/team/arena invites
   - guardian/player-link invites

## Notes

- Use shared local Postgres as the primary auth development path.
- Use `better-auth-ui` only for generic auth screens; keep app-specific membership and family UX custom.
- Keep commits incremental and locally verifiable.
