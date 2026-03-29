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

## Notes

- Use shared local Postgres as the primary auth development path.
- Use `better-auth-ui` only for generic auth screens; keep app-specific membership and family UX custom.
- Keep commits incremental and locally verifiable.
