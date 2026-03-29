# RinkLink Auth Implementation Plan (Detailed Merge)

## Summary

- Build auth with a separate `auth-service` on Render using `Better Auth`, backed by the same Neon Postgres instance as the FastAPI app.
- Standardize local development on shared `Postgres` via `Docker Compose`; SQLite remains a fallback path only, not the primary auth-development workflow.
- Use `email/password`, `Google`, `Microsoft`, and `Apple`; `email` is the canonical identity key and username login is excluded from v1.
- Use `better-auth-ui` only for commodity auth flows. Keep approval, invite, family, parent-child, and role-aware app surfaces custom in RinkLink.
- Keep authorization fully app-owned in FastAPI. Better Auth proves identity; FastAPI decides resource access across associations, teams, arenas, players, and events.
- Preserve the original goal that parents are first-class users who can manage a child's attendance and view the child's schedule, events, and team context.

## Architecture

### Services

- `frontend`
  - React/Vite app on Render
  - uses Better Auth client for session/auth flows
  - calls `auth-service` for auth endpoints
  - calls FastAPI for app data with Bearer token
- `auth-service`
  - Node/TypeScript service on Render
  - Better Auth with email/password, email verification, password reset, social providers
  - issues short-lived API JWTs for FastAPI
  - exposes JWKS endpoint
  - owns Better Auth schema in Postgres
- `backend`
  - existing FastAPI app on Render
  - validates JWTs locally against JWKS
  - owns authorization tables and all permission checks
  - exposes `/api/me`, invite, access-request, and app APIs

### Token/session flow

1. User signs in through Better Auth.
2. Better Auth maintains the browser auth session via its normal session cookie mechanism.
3. Frontend requests a short-lived API access token from a dedicated auth-service endpoint, authenticated by the Better Auth session cookie.
4. Frontend sends `Authorization: Bearer <token>` to FastAPI.
5. FastAPI validates JWT `kid`, signature, `iss`, `aud`, `exp`, `iat`.
6. FastAPI maps token subject to `app_users.auth_id`, loads memberships and links, computes effective capabilities, and authorizes every request.
7. When the API JWT expires, the frontend silently requests a fresh JWT from auth-service using the session cookie.
8. If the session cookie is invalid or the Better Auth session has ended, the refresh fails and the frontend redirects to sign-in.
9. Revocation is enforced by short TTL plus `app_users.revoked_at > token.iat`.

### Security defaults

- Production must fail closed.
- No synthetic admin fallback in production or staging.
- Add `APP_ENV` environment variable with values `development`, `staging`, `production`.
- Optional `AUTH_BYPASS_DEV_ONLY=true` may exist only in local dev. Backend startup must raise immediately if `AUTH_BYPASS_DEV_ONLY=true` and `APP_ENV != development`. Also hard-fail if `RENDER=true` or `CI=true` while bypass is enabled.
- Bearer token stays in memory on the frontend; do not store API tokens in `localStorage`.
- Better Auth handles CSRF on its own session endpoints; FastAPI uses Authorization headers, not cookies.
- Add rate limiting and account lockout on auth-service for login, password reset, and invite acceptance endpoints.

## Data Model

### Auth-service schema

- Better Auth core tables for users, accounts, sessions, verification, provider links.
- Configuration supports:
  - email verification
  - password reset
  - Google
  - Microsoft
  - Apple
  - JWT and JWKS issuance for FastAPI audience

### App schema additions

#### `app_users`

- `id`
- `auth_id` unique, Better Auth user id
- `email`
- `display_name`
- `status` enum-like string: `pending`, `active`, `suspended`
- `is_platform_admin`
- `default_team_id` nullable
- `revoked_at` nullable
- `created_at`
- `updated_at`

#### `association_memberships`

- `id`
- `user_id`
- `association_id`
- `role`: `association_admin`
- unique on `(user_id, association_id)`

#### `team_memberships`

- `id`
- `user_id`
- `team_id`
- `role`: `team_admin`, `manager`, `scheduler`, `coach`
- unique on `(user_id, team_id)`

#### `arena_memberships`

- `id`
- `user_id`
- `arena_id`
- `role`: `arena_admin`, `arena_ops`
- unique on `(user_id, arena_id)`

#### `player_guardianships`

- `id`
- `user_id`
- `player_id`
- relationship type optional: `parent`, `guardian`
- unique on `(user_id, player_id)`

#### `player_memberships`

- `id`
- `user_id`
- `player_id`
- unique on `(user_id, player_id)`

#### `invites`

- `id`
- `token`
- `email`
- `target_type`: `association`, `team`, `arena`, `guardian_link`, `player_link`
- `target_id`
- `role` nullable for non-role link types
- `status`: `pending`, `accepted`, `cancelled`, `expired`
- `invited_by_user_id`
- `expires_at`
- `accepted_at` nullable

#### `access_requests`

- `id`
- `user_id`
- `target_type`: `association`, `team`, `arena`, `guardian_link`, `player_link`
- `target_id`
- `status`: `pending`, `approved`, `rejected`
- `notes` nullable
- `reviewed_by_user_id` nullable
- `reviewed_at` nullable

#### `audit_log`

- `id`
- `actor_user_id`
- `action`
- `resource_type`
- `resource_id`
- `details_json`
- `created_at`

## Capability Model

### Base capabilities

- `platform.manage`
- `association.view`
- `association.manage`
- `team.view`
- `team.manage`
- `team.manage_roster`
- `team.manage_schedule`
- `team.manage_attendance`
- `team.manage_scoresheet`
- `team.manage_proposals`
- `team.manage_staff`
- `team.view_private`
- `arena.view`
- `arena.manage`
- `arena.manage_slots`
- `arena.manage_booking_requests`
- `player.respond_self`
- `player.respond_guarded`

### Role mapping

- `platform_admin`
  - all capabilities
- `association_admin`
  - `association.view`
  - `association.manage`
  - `team.view`
  - `team.manage`
  - `team.manage_roster`
  - `team.manage_schedule`
  - `team.manage_attendance`
  - `team.manage_scoresheet`
  - `team.manage_proposals`
  - `team.manage_staff`
  - `team.view_private`
  - `arena.view`
- `team_admin`
  - `team.view`
  - `team.manage`
  - `team.manage_roster`
  - `team.manage_schedule`
  - `team.manage_attendance`
  - `team.manage_scoresheet`
  - `team.manage_proposals`
  - `team.manage_staff`
  - `team.view_private`
  - `arena.view`
- `manager`
  - `team.view`
  - `team.manage_roster`
  - `team.manage_schedule`
  - `team.manage_attendance`
  - `team.manage_scoresheet`
  - `team.manage_proposals`
  - `team.view_private`
  - `arena.view`
- `scheduler`
  - `team.view`
  - `team.manage_schedule`
  - `team.manage_proposals`
  - `team.view_private`
  - `arena.view`
- `coach`
  - `team.view`
  - `team.manage_attendance`
  - `team.manage_scoresheet`
  - `team.view_private`
- `arena_admin`
  - `arena.view`
  - `arena.manage`
  - `arena.manage_slots`
  - `arena.manage_booking_requests`
- `arena_ops`
  - `arena.view`
  - `arena.manage_slots`
  - `arena.manage_booking_requests`
- `parent` or `guardian` link
  - `player.respond_guarded`
  - read access to linked child event and team context through resource-specific checks, not broad team capabilities
- `player` link
  - `player.respond_self`
  - read access to own event and team context through resource-specific checks

### Enforcement rule

- FastAPI computes capabilities per request from memberships and links.
- Path parameters are selectors only, never proof of permission.
- Read endpoints must be filtered or denied, not left open just because they are non-mutating.

## Backend Implementation

### New backend modules

- `backend/app/auth/jwks.py`
  - fetch JWKS from auth-service
  - cache keys
  - refresh on unknown `kid`
- `backend/app/auth/jwt.py`
  - decode and validate JWT
  - verify issuer, audience, signature, expiry
- `backend/app/auth/capabilities.py`
  - role-to-capability mapping
- `backend/app/auth/dependencies.py`
  - `current_user`
  - `require_active_user`
  - `require_platform_admin`
  - `require_capability`
  - `require_team_access`
  - `require_arena_access`
  - `require_player_access`

### Backend config additions

- `app_env`: `development`, `staging`, `production`
- `auth_enabled`
- `auth_bypass_dev_only`
- `auth_jwks_url`
- `auth_issuer`
- `auth_audience`

### New backend endpoints

- `GET /api/me`
  - returns:
    - app user profile
    - memberships
    - linked players
    - accessible teams
    - effective capabilities
    - pending invites or access requests summary if needed for UI
- `GET /api/invites`
- `POST /api/invites`
- `POST /api/invites/{token}/accept`
- `DELETE /api/invites/{id}`
- `GET /api/access-requests`
- `POST /api/access-requests`
- `POST /api/access-requests/{id}/approve`
- `POST /api/access-requests/{id}/reject`

### Existing router protection strategy

- Add authenticated user dependency to every protected router.
- Apply both read and write checks across existing routers:
  - `teams`
  - `players`
  - `events`
  - `availability`
  - `proposals`
  - `notifications`
  - `competitions`
  - `seasons` and standings
  - `arenas`
  - `ice_booking_requests`
  - `scoresheet`
  - `associations`
  - `search`
- Resource access rules:
  - team staff can read only assigned teams and related resources
  - association admins can read teams and resources under their association
  - arena staff can read only assigned arenas and arena operations
  - parents can read only linked child team and event context
  - players can read only self team and event context
  - platform admins can read everything

## Frontend Implementation

### Auth dependencies

- Better Auth client SDK
- `better-auth-ui` for commodity auth surfaces only

### New frontend modules

- `frontend/src/lib/auth-client.ts`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/components/ProtectedRoute.tsx`

### API client changes

- Inject Bearer token into every FastAPI request.
- Distinguish auth-service base URL from app API base URL.
- Handle `401` by requesting a fresh JWT from the dedicated auth-service endpoint using the Better Auth session cookie; if that refresh fails, redirect to sign-in.
- Handle pending access as `403` and redirect to `PendingApprovalPage`.

### Auth and onboarding screens

- Use `better-auth-ui` for:
  - sign in
  - sign up
  - forgot password
  - reset password
  - provider callback and verification states
- Build custom RinkLink screens for:
  - `PendingApprovalPage`
  - `InviteAcceptancePage`
  - family onboarding and child-link confirmation

### App shell changes

- Add `AuthProvider` above the current provider tree.
- Add protected routing around app pages.
- Filter `NAV_SECTIONS` by capabilities from `/api/me`.
- Add user/profile menu in header.
- Update `TeamContext` so teams are loaded only from server-scoped `/api/me` or filtered teams endpoint; `localStorage` continues to store only the last active team among accessible teams.

## Screen and Rights Matrix

### Dashboard `/`

- `platform_admin`: full operational overview
- `association_admin`: association and team summaries
- `team_admin`, `manager`, `scheduler`, `coach`: active-team dashboard
- `arena_admin`, `arena_ops`: arena ops summary
- `parent`, `player`: family dashboard variant with linked child or self schedule and RSVP focus
- pending users redirected to `/pending`

### Teams `/teams`

- `platform_admin`: full edit
- `association_admin`: create and edit teams within own association
- `team_admin`, `manager`, `scheduler`, `coach`: read-only scoped list of accessible teams
- `parent`, `player`, `arena-only`: hidden

### Associations `/associations`

- `platform_admin`: full edit
- `association_admin`: edit own association only
- everyone else: hidden

### Roster `/roster`

- `platform_admin`, `association_admin`, `team_admin`, `manager`: full edit, add, delete, CSV upload
- `coach`: read-only
- `scheduler`: hidden or read-only only if explicitly desired later; v1 hidden to match original plan
- `parent`, `player`, `arena-only`: hidden

### Availability `/availability`

- `platform_admin`, `association_admin`, `team_admin`, `manager`, `scheduler`: full edit
- `coach`, `parent`, `player`, `arena-only`: hidden

### Schedule `/schedule`

- `platform_admin`, `association_admin`, `team_admin`, `manager`, `scheduler`: create, edit, and cancel events
- `coach`: read-only list
- `parent`, `player`: read-only scoped list for linked child or self team context
- `arena-only`: hidden as main nav, but arena event visibility handled through arena detail flows

### Event detail `/schedule/:eventId`

- `team_admin`, `manager`, `scheduler`
  - edit event details subject to resource role
  - update attendance when allowed
  - confirm weekly status
- `coach`
  - update attendance
  - scoresheet, stats, signatures
  - no broader schedule admin changes
- `parent`
  - edit attendance only for linked child player ids
  - read event info, locker rooms, venue, notes allowed for their child's team context
- `player`
  - edit self attendance only
  - read own event and team context
- `arena_admin`, `arena_ops`
  - venue and locker room operational edits only when reached through arena workflow
  - no team-private edits

### Find Opponents `/search`

- `platform_admin`, `association_admin`, `team_admin`, `manager`, `scheduler`: full use
- `coach`, `parent`, `player`, `arena-only`: hidden

### Proposals `/proposals`

- `platform_admin`, `association_admin`, `team_admin`, `manager`, `scheduler`: accept, decline, cancel, and reschedule by resource scope
- `coach`, `parent`, `player`, `arena-only`: hidden

### Competitions `/competitions`

- `platform_admin`, `association_admin`, `team staff`: read-only
- `parent`, `player`: read-only if tied to linked child or self team context
- `arena-only`: hidden unless also holds team or association role

### Standings `/standings`

- same visibility as competitions

### Arenas `/arenas`

- `platform_admin`: full edit
- `arena_admin`, `arena_ops`: scoped edit on assigned arenas
- `association_admin`, `team_admin`, `manager`, `scheduler`: read-only catalog for scheduling flows
- `coach`, `parent`, `player`: hidden

### Arena detail `/arenas/:arenaId`

- `platform_admin`, `arena_admin`: full arena, rink, locker-room, slot, and request management
- `arena_ops`: operational edit without high-level destructive admin actions if that separation is desired
- `association_admin`, `team_admin`, `manager`, `scheduler`: read-only for scheduling context
- `coach`, `parent`, `player`: hidden

### Family dashboard

- new custom screen, required in v1
- `parent`
  - switch between linked children
  - upcoming events
  - attendance status by child
  - quick RSVP actions
- `player`
  - self schedule
  - self RSVP actions
- staff and arena users do not use this dashboard variant

## Invite and Access Request Flows

### Invite flow

- Admin creates invite for:
  - association admin or staff
  - team staff
  - arena staff
  - guardian link
  - player link
- Invite email includes tokenized link.
- Recipient signs up or signs in.
- Email must match invite email.
- Accepting invite creates the correct membership or link row and audit entry.

### Access request flow

- Public signed-up user with no access lands in pending and request UX.
- User may request:
  - team access
  - arena access
  - guardian link
  - player link
- Reviewer approves or rejects.
- Approval creates membership or link row and activates relevant access.

## Local Development and Deployment

### Local default

- `Docker Compose` with:
  - `postgres`
  - `backend`
  - `auth-service`
  - optional `frontend`, or frontend can still run separately
- Shared Postgres is the standard local mode.
- Alembic runs against Postgres locally.
- Better Auth also runs against the same Postgres instance locally.

### SQLite fallback

- SQLite remains possible only as a convenience path for isolated backend work.
- SQLite is not the supported mode for auth integration, invite flows, or CI parity.

### Production

- Neon Postgres stays the single production database.
- `backend` and `auth-service` both point to Neon.
- Render env vars include auth issuer, audience, JWKS URL, and provider secrets.

## Implementation Phases

### Phase 1: local and dev foundation

- Add `docker-compose.yml`
- Add env examples for backend and auth-service
- Update README to document local Postgres workflow
- Keep old SQLite notes as fallback only

### Phase 2: auth-service

- Scaffold `auth-service`
- Configure Better Auth
- Configure email/password and providers
- Expose JWKS
- Verify token issuance and callback flows

### Phase 3: backend auth foundation

- Add auth config
- Add auth modules
- Add authorization models and Alembic migration
- Add `/api/me`, invites, access requests
- Add audit logging helpers

### Phase 4: route protection

- Protect all routers
- Add read scoping
- Add dev-only bypass guard
- Add revocation enforcement

### Phase 5: frontend auth integration

- Add Better Auth client
- Add `AuthContext`
- Add protected routes
- Add token injection
- Add auth pages using `better-auth-ui`

### Phase 6: product-specific UI

- Add pending approval page
- Add invite acceptance page
- Add family dashboard
- Adapt schedule and event pages for parent and player read and RSVP flows
- Filter nav and route access by capability

### Phase 7: hardening

- Rate limiting
- account lockout
- audit coverage
- seed users and role fixtures
- Render deployment docs
- smoke and integration tests

## Test Plan

### Authentication

- email and password sign-up
- email verification required
- password reset flow
- Google login
- Microsoft login
- Apple login
- JWT issuance and refresh behavior

### Authorization

- unauthenticated request returns `401`
- invalid token returns `401`
- expired token returns `401`
- pending user returns `403`
- revoked user returns `403`
- wrong role or membership returns `403`
- platform admin bypass works

### Read scoping

- team staff cannot read unrelated teams
- arena staff cannot read team-private resources
- parent cannot read unrelated players or events
- player cannot read sibling or teammate attendance
- coach cannot access proposals or availability edits

### Write scoping

- manager cannot change staff roles
- scheduler cannot modify roster structure
- coach can update attendance (`team.manage_attendance`) and scoresheet (`team.manage_scoresheet`) only
- parent can RSVP only for linked children
- player can RSVP only for self
- arena ops can edit only assigned arena operational resources

### Invite and access flows

- email mismatch on invite accept is rejected
- expired invite is rejected
- guardian link invite creates `player_guardianships`
- player link invite creates `player_memberships`
- access request approval creates expected membership and audit log row

### Local and dev parity

- full stack works with Compose and shared Postgres
- backend and auth-service see same user identity state
- Alembic migrations run cleanly against local Postgres

## Assumptions

- Better Auth is acceptable as the auth framework.
- `better-auth-ui` is acceptable for generic auth pages only.
- Local Docker Compose and shared Postgres become the standard auth development path.
- Family dashboard and parent/player attendance workflows are in scope for v1, not deferred.
- The original persona and screen-access model remains the source of truth; implementation detail should not weaken it.
