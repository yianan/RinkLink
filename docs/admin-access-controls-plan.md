# Admin Access Controls Plan

## Summary

RinkLink currently has two revocation concepts:

- membership/link revocation, which removes a scoped authorization row
- user revocation via `POST /api/users/{id}/revoke`, which sets `app_users.revoked_at`

The current `user revoke` behavior is narrower than an admin would likely expect:

- existing API JWTs are rejected if `token.iat < revoked_at`
- the same identity can still authenticate again through Better Auth
- a fresh JWT can still be exchanged and used unless the backend blocks revoked users on every request

This should be redesigned into explicit admin actions with distinct semantics.

## Goal

Split access lifecycle controls into three separate admin actions:

1. Revoke membership
2. Disable app access
3. Disable auth account

This makes admin intent explicit, keeps audit history understandable, and prevents one overloaded "revoke user" action from meaning three different things.

## Current Problems

### Ambiguous admin intent

`revoke user` can be read as any of:

- remove one team or arena relationship
- block the user from using RinkLink at all
- disable sign-in entirely

Those are materially different actions.

### Partial enforcement

Current `app_users.revoked_at` only invalidates already-issued JWTs. It does not guarantee that a newly authenticated session is blocked from the backend.

### Poor UX language

An admin UI that shows only "Revoke user" or "Revoke access" is too vague for support, operations, and audit review.

### Recovery path is unclear

If a user is removed accidentally, it is not obvious whether the intended recovery is:

- restore one membership
- re-enable app access
- restore the auth account

## Proposed Model

### 1. Revoke Membership

Use when the admin wants to remove a specific scoped relationship while leaving the account usable.

Examples:

- remove a coach from one team
- remove a parent guardian link to one player
- remove arena access for one staff user

Expected result:

- the user keeps signing in normally
- the user keeps any other memberships or links
- effective capabilities lose only that scope
- access disappears on the next request because authorization context is rebuilt from DB state

Backend model:

- keep using the existing membership/link delete actions
- extend to all membership types consistently:
  - `association_memberships`
  - `team_memberships`
  - `arena_memberships`
  - `player_guardianships`
  - `player_memberships`

Suggested UI labels:

- `Remove team access`
- `Remove association access`
- `Remove arena access`
- `Remove family link`

Audit action names:

- `membership.revoked`
- `guardian_link.revoked`
- `player_link.revoked`

### 2. Disable App Access

Use when the identity may still exist, but the person should not be able to use RinkLink at all until restored.

Examples:

- user left the organization
- temporary support freeze
- disciplinary or abuse response inside the app

Expected result:

- all existing API JWTs are rejected
- fresh sign-in may still succeed at Better Auth, but RinkLink backend rejects app usage consistently
- the frontend should land on a clear disabled/suspended state instead of behaving like a normal pending user

Recommended backend semantics:

- add or reuse an app-owned state for hard denial at the backend
- prefer explicit status over overloaded timestamp logic

Recommended model:

- keep `revoked_at` for auditability and immediate token invalidation
- add a durable app-owned disable state:
  - either `app_users.status = 'disabled'`
  - or `app_users.access_state = 'active' | 'disabled'`

Recommended enforcement:

- `current_user` should reject any disabled app user on every request, regardless of JWT `iat`
- `require_active_user` should continue to reject non-active users for protected operational routes
- `/api/me` may either:
  - return `403 User access disabled`, or
  - return a minimal disabled payload if the frontend needs a dedicated disabled screen

Suggested UI labels:

- `Disable app access`
- `Re-enable app access`

Audit action names:

- `user.app_access_disabled`
- `user.app_access_restored`

### 3. Disable Auth Account

Use when identity itself must be blocked, not just app authorization.

Examples:

- confirmed account compromise
- fraud or platform-level abuse
- legal/compliance hold

Expected result:

- Better Auth sign-in is blocked
- existing Better Auth sessions are revoked if supported
- API token exchange no longer works
- backend access is also blocked

This should be rare and treated as a high-trust admin action.

Recommended implementation approach:

- keep this action in a separate "danger zone"
- implement via Better Auth admin/session controls if available
- if Better Auth does not provide full account disablement directly, store an auth-disabled marker and enforce it in auth-service sign-in/token issuance hooks

Suggested UI labels:

- `Disable sign-in`
- `Restore sign-in`

Audit action names:

- `user.auth_disabled`
- `user.auth_restored`

## Recommended Data Model Changes

### `app_users`

Keep:

- `revoked_at`

Add one explicit app-level disable field. Preferred options:

Option A:

- `status`: `pending`, `active`, `suspended`, `disabled`

Option B:

- `status`: `pending`, `active`, `suspended`
- `access_state`: `active`, `disabled`

Recommendation:

- choose option B if `status` is meant to describe onboarding lifecycle
- choose option A if `status` is already treated as the single source of truth for app availability

If option A is used:

- `pending`: authenticated but not approved yet
- `active`: usable
- `suspended`: temporarily blocked by admin policy
- `disabled`: explicitly disabled from app usage

If option B is used:

- keep onboarding and disablement as distinct concepts
- this is clearer if pending approval and disabled access must be rendered differently

### Optional Better Auth-side state

If auth-account disablement is implemented in-app rather than through a Better Auth native admin feature:

- store an auth-level block marker in auth-service-owned data
- check it during sign-in and token issuance

## API Proposal

### Membership and link revocation

Keep or extend:

- `DELETE /api/memberships/{kind}/{id}`

Where `kind` is one of:

- `association`
- `team`
- `arena`
- `guardian`
- `player`

Response:

- `200` with the removed relationship summary

### App access disable/restore

Replace the overloaded current revoke route with explicit actions:

- `POST /api/users/{id}/disable-app-access`
- `POST /api/users/{id}/restore-app-access`

Behavior:

- disable:
  - sets app disable state
  - sets `revoked_at = now()` to invalidate current JWTs
- restore:
  - clears app disable state
  - does not need to clear audit history

Response:

- `200` with updated user summary including disable state

### Auth account disable/restore

Separate route family:

- `POST /api/users/{id}/disable-auth`
- `POST /api/users/{id}/restore-auth`

Behavior:

- disable:
  - blocks future sign-ins
  - revokes current Better Auth sessions where supported
- restore:
  - allows sign-in again

### Deprecation path

Current route:

- `POST /api/users/{id}/revoke`

Recommendation:

- keep temporarily as an alias for `disable-app-access`
- mark as deprecated in code and UI
- remove once admin UI and callers are migrated

## Backend Enforcement Rules

### Authentication dependency

Update the backend user-loading flow so these rules are explicit:

1. Missing/invalid token: `401`
2. Disabled auth account: `403`
3. Disabled app access: `403`
4. Revoked old token where `iat < revoked_at`: `403`
5. Pending but not active user: allowed only on explicitly pending-safe routes
6. Active user with no required capability: `403`

This means:

- old tokens should die immediately after disablement
- fresh tokens should still be denied if app access is disabled

### Pending vs disabled

Pending users are waiting for approval. Disabled users were explicitly blocked.

Do not reuse the same frontend or backend semantics for both.

Recommended frontend behavior:

- pending user:
  - `/api/me` succeeds with pending state
  - app shows pending approval screen
- disabled user:
  - `/api/me` either returns a disabled payload or `403`
  - app shows a disabled access screen with support guidance

## UI Proposal

### Access management UI

On user detail screens, separate actions into sections:

#### Access

- list memberships and family links
- per-row remove actions

#### App Access

- `Disable app access`
- `Restore app access`

Explain:

- blocks use of RinkLink
- does not delete the person
- does not remove historical memberships or audit records

#### Sign-In

- `Disable sign-in`
- `Restore sign-in`

Explain:

- blocks authentication itself
- higher-impact action

#### Danger Zone

- only auth-account disablement should live here

### Confirmation copy

Use precise copy:

- membership removal:
  - `Remove this user's access to Mission 12U A?`
- app disablement:
  - `Disable this user's access to RinkLink? They will be signed out and blocked from using the app until restored.`
- auth disablement:
  - `Disable sign-in for this account? They will no longer be able to authenticate.`

## Audit Requirements

Every admin action in this area should record:

- actor user id
- action name
- target user id
- affected membership or resource ids
- previous state
- new state
- timestamp
- IP address
- user agent
- optional reason

Suggested action set:

- `membership.revoked`
- `membership.restored` if restoration actions are added
- `guardian_link.revoked`
- `player_link.revoked`
- `user.app_access_disabled`
- `user.app_access_restored`
- `user.auth_disabled`
- `user.auth_restored`

## Rollout Plan

### Phase 1

- define the semantics in backend and frontend copy
- add explicit app disable state
- implement `disable-app-access` and `restore-app-access`
- keep existing `revoke` route as deprecated alias

### Phase 2

- redesign the admin UI around separate access/app/sign-in sections
- add disabled-user frontend state
- update support/admin docs

### Phase 3

- implement auth-account disablement through Better Auth admin hooks or session controls
- add high-trust confirmation UX and audit reason capture

### Phase 4

- remove deprecated `revoke` naming and old callers

## Test Plan

### Membership revocation

- removing one team membership removes only that team capability
- removing one family link removes access only to that linked player
- unaffected memberships remain usable

### App access disablement

- existing JWT fails immediately after disablement
- fresh sign-in still succeeds at identity layer if intentionally allowed
- backend rejects `/api/me` and protected routes while disabled
- restore returns the user to normal app behavior

### Auth disablement

- sign-in is rejected
- token exchange is rejected
- existing sessions are invalidated where supported
- restore allows sign-in again

### UI

- admin sees distinct actions with distinct copy
- pending and disabled users render different states
- audit history reflects the exact action taken

## Recommendation

When this work is implemented, treat the current `revoke user` behavior as insufficient for a final admin control. It is useful only as a short-lived token invalidation mechanism. The product should move to explicit actions for:

- scoped membership removal
- app access disablement
- auth account disablement
