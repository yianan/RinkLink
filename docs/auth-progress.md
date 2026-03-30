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

## Notes

- Use shared local Postgres as the primary auth development path.
- Use `better-auth-ui` only for generic auth screens; keep app-specific membership and family UX custom.
- Keep commits incremental and locally verifiable.
