# RinkLink Product Feature Roadmap

This document captures the major product features that should be built next so future planning does not depend on chat history.

It is intentionally practical: each feature includes the user value, approximate scope, and key dependencies or cautions.

## Planning Principles

- Prioritize features that improve weekly team operations first
- Prefer workflow depth over broad but shallow surface area
- Avoid building external integrations that depend on undocumented scraping
- Keep association-level and marketplace features behind core team workflows

## Current Product Gaps

The app already covers core schedule, proposals, games, rinks, practices, standings, and roster management.

The biggest remaining gaps are:

- calendar sync outside the app
- player and parent availability workflows
- richer proposal negotiation and history
- better notifications and follow-up cues
- conflict detection across games, practices, and ice slots
- association-wide management views
- sanctioned external data imports

## Priority Tiers

### Tier 1: Build Next

These are the highest-value features with the best impact-to-effort ratio.

#### 1. Calendar Sync

- **What**: export games, practices, and open dates as iCal feeds
- **Why**: coaches and managers already live in Google Calendar, Apple Calendar, and Outlook
- **User value**: eliminates duplicate manual entry and makes schedule changes visible immediately
- **Scope**:
  - team-level calendar feed
  - per-category feeds for games, practices, and availability windows
  - stable URLs with optional tokenized access
- **Effort**: Small
- **Dependencies**: none

#### 2. Conflict Detection

- **What**: detect collisions and planning conflicts before users commit changes
- **Why**: this is one of the highest-risk failure points in youth hockey operations
- **User value**: avoids double-booking, bad turnaround windows, and missed confirmations
- **Scope**:
  - game vs practice conflicts
  - game vs blocked/open slot conflicts
  - overlapping proposal suggestions
  - optional travel-time warnings between distant rinks
- **Effort**: Medium
- **Dependencies**: calendar and location data already in place

#### 3. Proposal History and Counter-Proposals

- **What**: support back-and-forth negotiation rather than a mostly single-pass proposal flow
- **Why**: real scheduling requires iteration, not only accept/decline
- **User value**: reduces scheduling churn and makes the negotiation path auditable
- **Scope**:
  - proposal thread/history view
  - counter-propose date, time, and rink
  - revision trail
  - duplicate-proposal prevention across the full history
- **Effort**: Medium
- **Dependencies**: builds on current proposals system

#### 4. Notification Center Improvements

- **What**: make alerts actionable and easier to manage
- **Why**: the app has multiple workflows that require timely response
- **User value**: fewer missed actions and less tab-hopping
- **Scope**:
  - categories for proposals, confirmations, practices, and schedule changes
  - unread counts by type
  - batched digest option
  - mark-as-read and bulk clear
- **Effort**: Medium
- **Dependencies**: none

#### 5. Availability and RSVP

- **What**: let players or staff mark availability for games and practices
- **Why**: scheduling without attendance visibility is incomplete
- **User value**: helps coaches know whether a date is viable before locking it in
- **Scope**:
  - available / unavailable / tentative
  - team summary counts
  - notes for conflicts or arrival constraints
  - optional role-specific participation for goalies and skaters
- **Effort**: Medium
- **Dependencies**: roster stability; future auth will affect who can respond

### Tier 2: Build After Core Ops

These deepen the product once team operations are solid.

#### 6. Practice Planning

- **What**: turn practice bookings into actual practice plans
- **Why**: booked ice without structure is only half the workflow
- **User value**: improves preparation and reuse of coaching plans
- **Scope**:
  - recurring practice templates
  - objectives and notes
  - attendance view
  - equipment and special instructions
- **Effort**: Medium
- **Dependencies**: availability/RSVP improves this significantly

#### 7. Opponent Search Improvements

- **What**: make finding opponents more targeted and useful
- **Why**: this is a signature workflow for the product
- **User value**: better match quality and faster scheduling
- **Scope**:
  - saved filters
  - preferred opponents
  - blacklist/blocklist
  - travel-time ranking
  - surface by recent interaction history
- **Effort**: Medium
- **Dependencies**: optional mapping/travel enhancements

#### 8. Season Analytics

- **What**: show performance and operational trends over a season
- **Why**: staff need more than raw standings and schedules
- **User value**: helps teams review outcomes and identify scheduling patterns
- **Scope**:
  - home vs away record
  - goal differential
  - opponent history
  - rink usage
  - cancellation and acceptance rates
- **Effort**: Medium
- **Dependencies**: canonical stats and season record logic, now in place

#### 9. Printable and PDF Outputs

- **What**: generate clean printable exports
- **Why**: many rink and bench workflows still depend on paper or PDFs
- **User value**: reduces ad hoc screenshots and manual formatting
- **Scope**:
  - game sheet
  - roster handout
  - practice plan printout
  - season summary report
- **Effort**: Small to Medium
- **Dependencies**: none

### Tier 3: Platform Expansion

These are valuable, but should follow stronger core workflows.

#### 10. Association Admin View

- **What**: add cross-team visibility and management for club administrators
- **Why**: associations need to coordinate across teams, not only within one team
- **User value**: supports directors and schedulers managing multiple teams at once
- **Scope**:
  - club-wide dashboard
  - cross-team conflicts
  - ice usage reporting
  - standings and season oversight
  - shared announcements or policy reminders
- **Effort**: Large
- **Dependencies**: role and permission model later

#### 11. Ice Marketplace / Slot Exchange

- **What**: allow teams or associations to release, claim, or trade unused ice
- **Why**: unused ice is expensive and often recoverable if surfaced early
- **User value**: increases ice utilization and reduces waste
- **Scope**:
  - mark slot as available
  - claim or request slot
  - transfer workflow
  - audit trail
- **Effort**: Large
- **Dependencies**: stronger rink and slot workflow rules

#### 12. Tournament and Trip Mode

- **What**: support multi-game weekends and travel-heavy events
- **Why**: tournaments are operationally different from single-game scheduling
- **User value**: improves planning for destination events
- **Scope**:
  - grouped games
  - travel notes
  - lodging and restaurant references
  - weekend packet view
- **Effort**: Medium to Large
- **Dependencies**: games and calendar workflows

## External Integrations

These should be approached conservatively.

#### 13. USA Hockey Import

- **What**: sanctioned roster import or sync from USA Hockey
- **Why**: reduces manual roster entry and keeps official information aligned
- **Current understanding**:
  - no public official API has been identified
  - current official workflows appear to rely on registry tools, confirmation-number lookups, and uploads
- **Recommended approach**:
  - support admin-assisted import first
  - design for future partner integration if USA Hockey offers it
- **Effort**: Medium to Large
- **Dependencies**: authentication, role controls, and agreement with USA Hockey if direct sync is desired

## Technical Enhancements

These are not end-user features, but they materially improve delivery and runtime quality.

#### 15. Frontend Code Splitting

- **What**: split the frontend into smaller route-level and shared-vendor chunks
- **Why**: the main app bundle is already large enough to trigger build warnings
- **User value**: faster initial loads, better cache behavior, and less UI delay on slower devices
- **Scope**:
  - route-level lazy loading
  - shared chunk strategy for heavy page groups
  - loading fallbacks that match the existing skeleton system
- **Effort**: Medium
- **Dependencies**: none

#### 16. MYHockey Import

- **What**: sanctioned rating import from MYHockey
- **Why**: keeps opponent comparisons and team details current
- **Current understanding**:
  - no public sanctioned API has been identified
  - scraping should not be a product dependency
- **Recommended approach**:
  - keep manual entry for now
  - add source URL and last-verified metadata
  - only build direct sync if partner access is obtained
- **Effort**: Medium
- **Dependencies**: partner approval if automated

## Supporting Enhancements

These are not the highest-level roadmap items, but they will improve product quality.

### Workflow Quality

- richer search result explanations for why an opponent matched
- better dashboard summaries for multi-team and all-season views
- more complete audit history on state-changing actions
- soft warnings before destructive actions
- clearer admin controls for access lifecycle:
  - separate membership revocation from full app-access revocation
  - distinguish app-access disablement from auth-account disablement
  - document and redesign current `revoke user` behavior, which invalidates existing JWTs but still allows a fresh sign-in
  - see [Admin Access Controls Plan](./admin-access-controls-plan.md)

### Communication

- richer proposal and game message threads
- optional email digests
- read receipts for high-importance actions

### Data Quality

- stronger validation around duplicate games and duplicate proposals
- more explicit location normalization for rinks
- import tools for bulk roster, rink, and slot cleanup

### Mobile and UX

- more compact and intentional mobile action patterns
- lower-flicker loading and hydration states
- more deliberate empty states with next-step guidance

## Suggested Build Order

If the goal is maximum product value with reasonable implementation risk, build in this order:

1. Calendar sync
2. Conflict detection
3. Proposal history and counter-proposals
4. Notification center improvements
5. Availability and RSVP
6. Practice planning
7. Opponent search improvements
8. Season analytics
9. Printable and PDF outputs
10. Association admin view
11. Ice marketplace / slot exchange
12. Tournament and trip mode
13. USA Hockey import
14. Frontend code splitting
15. MYHockey import

## Features to Delay Intentionally

These should not block the roadmap above:

- full authentication and role model until workflow priorities are clearer
- external scraping-based integrations
- large admin features before team-level workflows feel complete
- monetization and advertising features

## Recommended Next Planning Step

When work resumes on this roadmap, the next planning artifact should be a delivery plan for the first five items with:

- exact requirements
- data model changes
- API additions
- frontend screens and components
- rollout order
- test cases
