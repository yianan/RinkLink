# Better Auth-Based Authentication and Authorization for RinkLink

## Summary

- Use a dedicated `auth-service` on Render built with `Better Auth`, backed by the same Neon Postgres database.
- Enable `email/password`, `Google`, `Microsoft`, and `Apple` sign-in. Use `email` as the canonical identity key; do not enable username login in v1.
- Keep `RinkLink` authorization fully app-owned in the FastAPI database layer. Better Auth handles identity, sessions, email verification, password reset, and social sign-in; FastAPI remains the source of truth for roles, parent-child links, and resource permissions.
- Require public users to sign up first, then obtain access through approval or invitation.
- Support both parents and players in v1, with parents as the primary family workflow.

## Technical Design

- Add a new Render service: `auth-service` using Node/TypeScript.
- Keep the existing FastAPI backend as the main application API.
- Store Better Auth tables in the same Neon Postgres instance in a dedicated auth schema.
- Keep app authorization tables in the existing application schema.

### Better Auth responsibilities

- Sign-up, sign-in, sign-out
- Email verification
- Password reset
- Linked social providers:
  - Google
  - Microsoft
  - Apple

### RinkLink responsibilities

- Association, team, arena, parent, and player authorization
- Invite and approval semantics tied to real app entities
- Parent-child access delegation
- Audit logging for privileged actions

### Authorization tables

- `app_users`
- `association_memberships`
- `team_memberships`
- `arena_memberships`
- `player_guardianships`
- `player_memberships`
- `invites`
- `access_requests`
- `audit_log`

Each app table should key back to the Better Auth user ID.

### Auth flow

1. Frontend authenticates against `auth-service`.
2. Better Auth maintains the browser session.
3. `auth-service` issues short-lived API access tokens for FastAPI.
4. FastAPI validates those tokens and loads effective permissions from app tables.
5. Every protected route checks both identity and capability server-side.

### Frontend integration changes

- Replace the current bootstrap pattern that loads all teams and relies on `localStorage` for the active team.
- Add `/api/me` on the FastAPI side to return:
  - current app user
  - memberships
  - linked players
  - accessible teams
  - default context
  - granted capabilities
- Add auth and onboarding screens:
  - Login
  - Sign up
  - Verify email
  - Forgot password
  - Reset password
  - Pending approval
- Add a new family-oriented surface:
  - `Family Dashboard`
- Gate routes and actions in the frontend by capability, but continue enforcing all authorization in FastAPI.

## Personas and Rights

### Platform admin

- Screens:
  - all current screens
  - future internal `User Access` screen
  - future internal `Audit` screen
- Edit rights:
  - full CRUD across associations, teams, arenas, memberships, invites, approvals, guardian links, and support actions

### Association admin

- Screens:
  - `Dashboard`
  - `Competitions`
  - `Standings`
  - `Teams`
  - `Roster`
  - `Availability`
  - `Schedule`
  - `Event Detail`
  - `Find Opponents`
  - `Proposals`
  - `Associations`
- Edit rights:
  - update their association record
  - create and update teams in their association
  - manage rosters, venue assignments, staff roles, parent/player invites, guardian links, and approvals
  - read arena catalog
  - no arena inventory edits unless separately granted arena permissions

### Team admin

- Screens:
  - `Dashboard`
  - `Roster`
  - `Availability`
  - `Schedule`
  - `Event Detail`
  - `Find Opponents`
  - `Proposals`
  - `Competitions`
  - `Standings`
  - `Teams`
- Edit rights:
  - full control over assigned team roster, attendance, schedule, event edits, proposal actions, team settings, parent/player invites, and team staff roles
  - no association-wide edits

### Manager

- Screens:
  - `Dashboard`
  - `Roster`
  - `Availability`
  - `Schedule`
  - `Event Detail`
  - `Find Opponents`
  - `Proposals`
  - `Competitions`
  - `Standings`
  - `Teams`
- Edit rights:
  - manage roster, attendance, events, proposals, and family invites for their team
  - read team settings and association information
  - cannot change staff roles, delete team, or edit association records

### Scheduler

- Screens:
  - `Dashboard`
  - `Availability`
  - `Schedule`
  - `Event Detail`
  - `Find Opponents`
  - `Proposals`
  - `Competitions`
  - `Standings`
  - `Teams`
- Edit rights:
  - create, edit, and cancel events
  - manage availability windows
  - submit, accept, and cancel scheduling proposals
  - request ice
  - confirm weekly events
  - roster is read-only
  - no staff-management rights

### Coach

- Screens:
  - `Dashboard`
  - `Roster`
  - `Schedule`
  - `Event Detail`
  - `Competitions`
  - `Standings`
- Edit rights:
  - update attendance for the team
  - enter scoresheet data
  - update player stats
  - update goalie stats
  - add signatures
  - add event notes
  - roster structure, availability planning, proposals, and team settings remain read-only or hidden

### Arena admin

- Screens:
  - `Arenas`
  - `Arena Detail`
- Edit rights:
  - edit assigned arena record
  - manage rinks
  - manage locker rooms
  - manage ice slots
  - manage booking requests
  - manage locker-room assignments
  - no team roster or proposal rights unless also granted team permissions

### Arena ops/staff

- Screens:
  - `Arenas`
  - `Arena Detail`
- Edit rights:
  - manage rink operations, locker rooms, ice slots, and booking request responses for assigned arenas
  - cannot delete arena or change high-level arena ownership/settings

### Parent/guardian

- Screens:
  - new `Family Dashboard`
  - read-only `Schedule`
  - read-only `Event Detail`
  - read-only `Standings`
  - read-only `Competitions`
- Edit rights:
  - submit and update attendance only for linked child players
  - switch between linked children
  - view event time, location, locker-room details, and basic team context
  - no access to:
    - `Roster`
    - `Availability`
    - `Find Opponents`
    - `Proposals`
    - `Associations`
    - `Arenas`

### Player

- Screens:
  - `Family Dashboard` in player mode
  - read-only `Schedule`
  - read-only `Event Detail`
  - read-only `Standings`
  - read-only `Competitions`
- Edit rights:
  - submit and update only their own attendance
  - no edits to teammates, roster, scheduling, or admin surfaces

## Screen-Level Access Rules

### `/` Dashboard

- Visible to all authenticated personas except users still pending approval.
- Content should be persona-specific:
  - team summary for team staff
  - family summary for parents and players
  - ops summary for arena users

### `/roster`

- Edit:
  - platform admin
  - association admin
  - team admin
  - manager
- Read-only:
  - coach
- Hidden:
  - scheduler
  - parent
  - player
  - arena users

### `/availability`

- Edit:
  - platform admin
  - association admin
  - team admin
  - manager
  - scheduler
- Hidden:
  - coach
  - parent
  - player
  - arena users

### `/schedule`

- Edit events:
  - platform admin
  - association admin
  - team admin
  - manager
  - scheduler
- Read-only event list:
  - coach
  - parent
  - player
- Hidden from arena-only users unless reached through arena workflows

### `/schedule/:eventId`

- Staff edits:
  - attendance, confirmations, event fields, and scoresheet actions based on role
- Parent edits:
  - linked child attendance only
- Player edits:
  - self attendance only
- Arena edits:
  - locker-room and venue operations only when reached from arena workflow

### `/search`

- Visible and actionable:
  - platform admin
  - association admin
  - team admin
  - manager
  - scheduler
- Hidden:
  - coach
  - parent
  - player
  - arena-only users

### `/proposals`

- Respond and edit:
  - platform admin
  - association admin
  - team admin
  - manager
  - scheduler
- Hidden:
  - coach
  - parent
  - player
  - arena-only users

### `/competitions`

- Read-only:
  - all team personas
  - parents
  - players
- Hidden:
  - arena-only users unless they also hold team or association permissions

### `/standings`

- Read-only:
  - all team personas
  - parents
  - players
- Hidden:
  - arena-only users unless they also hold team or association permissions

### `/teams`

- Edit:
  - platform admin
  - association admin
- Read-only scoped list:
  - team admin
  - manager
  - scheduler
  - coach
- Hidden:
  - parent
  - player
  - arena-only users

### `/associations`

- Edit:
  - platform admin
  - association admin for their own association
- Hidden:
  - everyone else

### `/arenas`

- Edit:
  - platform admin
  - arena admin
  - arena ops
- Read-only catalog:
  - association admin
  - team admin
  - manager
  - scheduler
- Hidden:
  - parent
  - player

### `/arenas/:arenaId`

- Edit:
  - platform admin
  - arena admin
  - arena ops
- Read-only as needed for scheduling:
  - association admin
  - team admin
  - manager
  - scheduler
- Hidden:
  - parent
  - player

## Recommended Enforcement Model

- Define granular capabilities rather than relying on a single role switch.
- Example capabilities:
  - `association.manage`
  - `team.manage`
  - `team.manage_roster`
  - `team.manage_schedule`
  - `team.manage_attendance`
  - `team.manage_proposals`
  - `team.view_private`
  - `arena.manage`
  - `arena.manage_slots`
  - `arena.manage_booking_requests`
  - `player.respond_self`
  - `player.respond_guarded`
- Use FastAPI dependencies such as:
  - `current_user`
  - `require_capability`
  - `require_team_access`
  - `require_arena_access`
  - `require_player_access`
- Treat path IDs like `team_id`, `arena_id`, and `player_id` as resource selectors only, never as proof of authorization.

## Test Plan

- Email/password sign-up requires email verification before protected app access.
- Google, Microsoft, and Apple sign-in all reach the same onboarding flow and map to a single app user per person.
- Pending-approval users can authenticate but cannot access protected operational routes.
- Forged `team_id`, `arena_id`, and `player_id` path access is rejected server-side.
- A parent linked to multiple children can view both schedules and submit attendance only for those linked player IDs.
- A player can update only their own attendance and cannot alter sibling or teammate attendance.
- A coach can update attendance and scoresheet data but cannot create proposals or edit roster structure.
- A scheduler can manage availability, events, and proposals but cannot change roster structure or staff roles.
- Arena ops can manage slots and booking requests only for assigned arenas.
- Revoking a membership or guardian link removes access on the next token refresh or request.

## Assumptions

- A separate TypeScript auth service on Render is acceptable.
- Better Auth is used for identity and session features only.
- FastAPI remains the source of truth for authorization.
- Username login is intentionally excluded from v1, even if Better Auth supports it via optional plugins.

## References

- [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth basic usage](https://www.better-auth.com/docs/basic-usage)
- [Better Auth Google](https://www.better-auth.com/docs/authentication/google)
- [Better Auth Microsoft](https://beta.better-auth.com/docs/authentication/microsoft)
- [Better Auth Apple](https://www.better-auth.com/docs/authentication/apple)
- [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management)
- [Better Auth OAuth provider](https://better-auth.com/docs/plugins/oauth-provider)
