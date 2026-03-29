# RinkLink UI Design System Specification

## Purpose

This document describes the current RinkLink user interface as a design system rather than as a set of individual screens. It defines the visual language, layout model, interaction patterns, page archetypes, and component rules that make the product coherent.

The goal is to preserve consistency as the app grows and to give future product and engineering work a shared standard for how new screens should look and behave.

---

## 1. Product Character

RinkLink is a youth hockey operations product. The UI should therefore feel:

- operational rather than marketing-oriented
- dense but readable
- credible and professional
- sports-specific without becoming gimmicky
- modern, dark-mode-first, and more visually distinct than a default enterprise dashboard

The current interface succeeds when it feels like a scheduling and game-operations console for hockey teams, not a generic CRUD application.

Core product qualities:

- **Actionable**: users should immediately see what needs attention
- **Structured**: high-information views must still feel organized
- **Contextual**: team and season context should be visible only when relevant
- **Scannable**: tables and cards should support fast reading
- **Sport-aware**: competition, standings, schedule, proposal, and scoresheet workflows should feel native to youth hockey operations

---

## 2. Global Visual Language

### 2.1 Theme Direction

The app uses a dark-first “arena” theme with light mode as an alternate preference.

The visual mix is:

- deep slate/navy bases
- cyan and violet accents
- translucent surfaces
- soft borders and soft shadows
- bright, high-contrast primary actions

This creates a more distinctive identity than standard Material or default Tailwind aesthetics.

### 2.2 Color Roles

The system uses semantic app-level color roles rather than styling each screen independently.

Primary roles:

- **Background base**: layered slate-to-indigo atmospheric gradients
- **Surface**: translucent white in light mode, translucent slate in dark mode
- **Surface strong**: slightly more opaque card/modal surface
- **Border subtle / strong**: low-contrast separators and shells
- **Accent link**: cyan/violet-highlighted navigational emphasis
- **Focus ring**: cyan-based focus treatment
- **Disabled surface / text**: clearly muted neutral states

Status colors:

- **Info**: sky / blue
- **Success**: emerald / green
- **Warning**: amber / orange
- **Danger**: rose / red
- **Accent**: violet
- **Neutral**: slate

Competition-specific color coding extends this logic:

- `League` → sky
- `State Tournament` → amber
- `District` → orange
- `Showcase` / `Tournament` → emerald
- `Festival` → violet
- `Non-League` / `Scrimmage` → neutral

### 2.3 Typography

Font family is `Inter Variable`.

Typography principles:

- page titles are compact, semibold, and tightly tracked
- subtitles are muted, short, and operational
- table headers are small uppercase for scanability
- primary data uses medium weight, not heavy bolding
- small metadata is muted but still legible in dark mode

Typography hierarchy:

- **Page title**: `text-xl` / `sm:text-2xl`, semibold, tracking-tight
- **Page subtitle**: `text-sm`, muted
- **Section labels**: small, semibold
- **Table headers**: uppercase, extra-small, tracking-wide
- **Badges / pills**: extra-small to small, medium weight

---

## 3. App Shell

### 3.1 Header

The top header is fixed and always visible.

It contains:

- product branding at the left
- contextual selectors at the right
- theme toggle at the far right
- mobile navigation trigger on smaller screens

Branding pattern:

- snowflake icon
- `RinkLink`
- `Ice time & scheduling`

Header behavior:

- always visible
- lightly translucent / gradient-backed
- separated from content by a subtle bottom border

### 3.2 Sidebar Navigation

Desktop uses a fixed left sidebar.

Navigation items:

- Dashboard
- Associations
- Competitions
- Standings
- Teams
- Roster
- Schedule
- Games
- Find Opponents
- Proposals
- Practice
- Rinks

Each item includes:

- icon
- text label
- active state treatment

Active nav style:

- highlighted card-like background
- accent-colored icon
- visible left indicator bar

Inactive nav style:

- muted icon and text
- hover surface highlight

### 3.3 Mobile Navigation

Mobile replaces the fixed sidebar with:

- hamburger button in the header
- slide-out full-height navigation drawer
- dimmed overlay backdrop

The drawer reuses the same navigation order and iconography as desktop.

---

## 4. Context Model in the UI

The app is strongly context-driven. Two global selectors determine much of what the user sees:

- **Active team**
- **Season**

### 4.1 Active Team

The active team selector appears only on pages where team context matters.

Selector behavior:

- the selected team should display its logo alongside the team name
- dropdown options should include the team logo and enough supporting metadata to disambiguate similarly named teams
- trigger text and hover states must remain legible in both light and dark mode

It is intentionally hidden on:

- `Associations`
- `Rinks`
- `Competitions`

Those screens are treated as cross-team reference or administrative views.

### 4.2 Season

The season selector appears only where season context matters.

It is hidden entirely on:

- `Associations`
- `Rinks`

It allows `All Seasons` only on pages where cross-season views are meaningful.

It requires a specific season on:

- `Standings`
- `Schedule`
- `Find Opponents`
- `Practice`
- `Proposals`
- `Roster`
- `Competitions`

This rule is important. Season selection is not merely decorative; it must match the actual data semantics of the page.

---

## 5. Core UI Primitives

### 5.1 Buttons

Button variants:

- `primary`
- `outline`
- `ghost`
- `destructive`
- `icon` sizing pattern

Rules:

- primary buttons use a cyan → sky → violet gradient
- outline buttons are used for explicit secondary actions that still need prominence
- ghost buttons are used for low-emphasis actions, utility actions, and established icon actions
- destructive buttons are reserved for delete/cancel flows and should read as risky, not merely secondary
- disabled buttons must be unmistakably inactive

Usage guidance:

- use one clear primary action per local workflow
- keep “Cancel” after the primary action
- use icon buttons only when paired with tooltip/title and the meaning is established
- do not introduce an additional filled “secondary” action style; the live hierarchy should stay intentionally tight

Action hierarchy:

- `primary`: the main forward action on the current surface
- `outline`: explicit secondary actions such as `Edit`, `Manage`, `Review`, `Open`, or neutral alternatives to the main action
- `ghost`: low-emphasis actions such as `Back`, `Clear all`, local utilities, and established tertiary actions
- `destructive`: destructive actions such as `Delete`, `Cancel Booking`, `Cancel Event`, `Reject`, or similar irreversible/negative operations

Hierarchy rules:

- a page header should normally contain at most one primary action
- a card/section should normally contain at most one primary action
- back/navigation actions should not visually compete with create/save/confirm actions
- actions with very different risk levels should not share the same visual tier
- destructive actions should not be presented as neutral outline actions unless they are intentionally de-emphasized and clearly supported by surrounding context

Labeling rules:

- use `Open` for navigation to another page, detail view, or workspace such as `Open Event`, `Open Schedule`, or `Open Proposals`
- avoid `View` as the default navigation verb; reserve it only for truly read-only previews
- use `Review` for pending items that need a decision and `Manage` for existing items that need follow-up work
- use `Cancel` to dismiss or abandon an in-progress form/modal, and use qualified destructive labels such as `Cancel Event` or `Cancel Booking` when voiding something real
- use `Back` for return navigation
- reserve `Close` for passive informational surfaces with no in-progress work
- prefer labeled destructive buttons over icon-only destructive buttons when the action is high-stakes and there is room
- use icon-only destructive actions mainly in dense row/table contexts where the action pattern is already well established

### 5.2 Cards

Cards are the default container pattern.

Card characteristics:

- rounded `2xl` corners
- subtle border
- translucent surface
- soft shadow
- light backdrop blur

Cards are used for:

- dashboard summaries
- expandable filter panels
- tables
- modal-like grouped content
- summary containers inside detail pages

### 5.3 Inputs and Selects

Inputs and selects follow the same field pattern:

- rounded corners
- soft border
- slightly stronger surface opacity than cards
- visible cyan focus state
- clear disabled treatment

Rules:

- fields should be compact, not oversized
- numeric fields should use steppers where editing counts or stats
- required fields should not use “optional” copy
- time fields should be labeled by meaning, not just by raw type
- paired time fields should use explicit start/end language such as `Available From` / `Available Until` or `Slot Starts` / `Slot Ends`
- when two time fields define a range, the end time must not be earlier than the start time

### 5.4 Badges

Badges communicate compact state, type, or category.

Use badges for:

- game/proposal statuses
- home/away tags
- competition types
- filter summaries

Do not use badges when plain text is sufficient and repeated badges would add noise.

### 5.5 Alerts

Alerts are used for:

- info notices
- successful actions
- warnings
- error states

They are rounded, bordered, and color-coded by semantic intent.

### 5.6 Modals

Modals are used for focused workflows such as:

- add/edit forms
- proposal creation
- rescheduling
- CSV upload confirmation

Modal characteristics:

- centered panel
- translucent dark backdrop
- fixed header with title
- close icon in top-right
- scrollable content body
- optional footer with action buttons

Rules:

- modal titles should be direct and task-specific
- modal footer should use primary action first, cancel second
- avoid overloading modals with too many unrelated controls

---

## 6. Reusable Screen Patterns

### 6.1 Page Header

Every major screen starts with a `PageHeader` pattern:

- left: title and subtitle
- right: actions

This keeps screen entry consistent and prevents each page from inventing its own heading structure.

PageHeader action taxonomy:

- first: optional navigation action such as `Back`, rendered quieter than task actions
- second: optional secondary management action such as `Edit`, `Review`, or `Open`
- last: optional primary creation/commit action such as `Add Rink`, `Schedule Event`, or `Add Team`

PageHeader rules:

- if a back action is present, it should normally use the quiet/ghost tier rather than outline or primary
- avoid making navigation and task actions look equivalent
- avoid more than three header actions unless the screen is exceptionally action-rich
- if two non-navigation actions are present, they should usually be one outline and one primary
- destructive page-level actions should be rare; prefer locating them closer to the object they affect unless the whole screen is about that destructive decision

### 6.2 Segmented Tabs

Segmented tabs are used when switching between closely related views inside a single screen.

Examples:

- `Upcoming / Past / All`
- `Incoming / Outgoing / Accepted / History`
- `Players / Upload CSV`
- `Upcoming / Past / Season Calendar / Upload CSV`

Rules:

- use segmented tabs for mode switching, not filtering
- active tab uses a stronger card-like state
- inactive tabs remain quiet until hovered

### 6.3 Compact Filter Panels

The current filter pattern is:

- single `Filters` button in the page header
- collapsible filter panel on demand
- multi-select pill groups
- active filter badges visible when collapsed
- `Clear all` action

This pattern is now standard on:

- Competitions
- Teams
- Games
- Schedule
- Proposals
- Associations
- Rinks

Rules:

- keep filters hidden by default unless the page is primarily a search tool
- within a filter group, pills can toggle on/off independently
- across groups, filters compound
- filter groups should use color differentiation for quick scan

### 6.4 Tables

Tables are the default desktop presentation for dense operational data.

Table rules:

- fixed headers with short labels
- no unnecessary horizontal scrolling on desktop
- rows should support hover state
- actions should be compact and aligned consistently
- columns must prioritize the information hierarchy of the screen

If tables become too cramped on smaller widths:

- switch to card layout rather than forcing horizontal scrolling

### 6.5 Mobile Cards

Mobile cards are used when a table would become unreadable.

Card rules:

- preserve the most important hierarchy from the desktop table
- keep action buttons accessible
- collapse secondary metadata into smaller supporting lines
- dense card rows may use icon-only actions only when the action vocabulary is already learned elsewhere on the page
- if a card action is consequential and there is room, prefer a labeled button over an icon-only action

---

## 7. Interaction Conventions

### 7.1 Click Targets

Use the following patterns consistently:

- stat cards are clickable
- summary cards are clickable
- team names are clickable where they are intended to switch active team / navigate
- league names link externally if the competition has a website
- manager names and emails use `mailto:` where that is the intended behavior

Action density guidance:

- dense row actions may use ghost icon buttons with tooltips
- section-level operations should usually use labeled buttons
- destructive row actions can be icon-only, but destructive section-level actions should normally be labeled

### 7.2 Tooltips

Icon-only controls should expose tooltips immediately on hover/focus.

Tooltips are appropriate for:

- icon-only actions
- dense action rows
- navigation buttons in mobile/desktop chrome

Tooltips should not be used as a substitute for poor labeling on primary content.

### 7.3 Status Language

Status wording should be explicit and consistent.

Examples:

- `Scheduled`
- `Both confirmed`
- `Home confirmed`
- `Away confirmed`
- `Final`
- `Cancelled`

Avoid inconsistent capitalization or alternate spellings across screens.

### 7.4 Data Entry

When a user edits operational data:

- numeric sports fields should use integer-only inputs
- scores should not allow negative numbers
- penalty minutes should require valid positive values
- final scores may remain editable when the workflow requires post-game correction
- time-entry forms should communicate what each time represents before the user interacts with the control
- invalid time ranges should be blocked in the UI and rejected in the API so partial edits cannot create impossible schedules

---

## 8. Page Archetypes

### 8.1 Dashboard

Purpose:

- operational home for the active team

Structure:

- page header with team + season context
- one prominent environment/system action
- KPI stat cards
- summary cards for the most important next actions

Behavior:

- cards are navigational
- the page should remain a summary layer, not a filter-heavy workspace

### 8.2 Reference / Admin Lists

Examples:

- Associations
- Rinks

Structure:

- page header
- optional filters
- add button
- dense management table

These screens are global directories and should stay season/team-neutral unless the underlying data model changes.

### 8.3 Team / Entity Management Lists

Examples:

- Teams
- Roster

Structure:

- page header
- optional filters or segmented mode switch
- desktop table / mobile card list
- add/edit/delete workflow

These screens mix browsing and data maintenance.

### 8.4 Scheduling Views

Examples:

- Schedule
- Find Opponents
- Proposals
- Practice

These are workflow screens and should emphasize:

- mode switching
- filters
- clear statuses
- concrete actions

### 8.5 Competition / Standings Views

Examples:

- Competitions
- Standings

These are sports-structure screens and should clearly separate:

- competition
- division
- teams
- standings data

The visual hierarchy must make those layers unmistakable.

### 8.6 Game Detail / Scoresheet

Purpose:

- full operational game record

Structure:

- summary header
- logistical actions
- score block
- player stats
- penalties
- goalie stats
- signatures

This screen is the most workflow-dense page in the app and should remain highly structured.

---

## 9. Screen-by-Screen Current Interpretation

### Dashboard

- summary-first
- KPI cards
- clickable overview cards
- strong emphasis on current team context

### Associations

- admin directory
- teams shown inline as clickable chips
- low dependence on season/team context

### Competitions

- hierarchical competition browser
- most visually expressive reference screen in the app
- league and division must read as different layers from team rows

### Standings

- stripped-down scoreboard screen
- one competition division at a time
- should not become a general-purpose explorer

### Teams

- master operating list of teams
- combines identity, competition placement, ranking, record, and manager contact

### Roster

- season-specific roster management
- compact and cleaner than other data-heavy screens

### Schedule

- operations list of open, scheduled, confirmed, and past dates
- one of the most action-rich screens

### Games

- match ledger with lightweight inline editing

### Game Detail

- full digital scoresheet

### Find Opponents

- search-and-propose workflow

### Proposals

- negotiation and coordination workflow

### Practice

- lighter-weight operational booking view

### Rinks

- rink directory and slot-management entry point

---

## 10. Responsive Rules

### Desktop

Desktop is optimized for:

- fixed sidebar navigation
- dense tables
- inline editing
- more simultaneous context

### Mobile

Mobile is optimized for:

- top-only chrome
- slide-out navigation drawer
- compressed selectors
- card conversions where needed
- fewer horizontally constrained tables

Rules:

- do not force desktop tables onto small screens if readability collapses
- preserve action access on mobile
- prioritize the primary workflow, not column parity with desktop

---

## 11. Copy and Labeling Rules

### Titles

- use short nouns or noun phrases
- avoid marketing-style language

### Subtitles

- explain the operational purpose of the screen
- stay brief
- mention season context only where that is actually relevant

### Actions

- use explicit verbs
- prefer `Add`, `Edit`, `Open`, `Review`, `Manage`, `Confirm`, `Cancel`, `Propose`, `Save`
- use `Open` for cross-screen navigation and avoid mixing `Open` and `View` for the same action family
- use `Review` for pending requests and `Manage` for accepted or already-created operational objects
- use `Back` for return navigation
- use `Cancel` for dismissing in-progress UI or cancelling a real booking/proposal/event when qualified
- reserve `Close` for passive informational dismissal only

### Empty States

- should explain what is missing in practical terms
- should avoid sounding like an error when the state is normal

---

## 12. System Rules for New UI Work

When adding a new screen or component:

1. Start from an existing page archetype rather than inventing a new shell.
2. Use `PageHeader` unless there is a strong reason not to.
3. Use the compact `Filters` pattern rather than always-open dense filter bars.
4. Prefer segmented tabs for mode switching.
5. Match the semantic button hierarchy already in use.
6. Preserve the team/season visibility rules.
7. Use badges only when they communicate real state or category.
8. Avoid default browser-looking controls or bland flat white buttons.
9. Ensure mobile has a deliberate layout, not just a squeezed desktop table.
10. Keep status wording and status color semantics consistent with existing screens.

---

## 13. What This Design System Is Trying to Avoid

The current system intentionally avoids:

- Material-style blandness
- heavy gray enterprise flatness
- always-visible filter clutter
- generic CRUD page headers
- inconsistent status wording
- horizontal table overflow as a default solution
- redundant metadata that repeats what is already obvious

---

## 14. Practical Summary

RinkLink’s UI system is a dark-first sports operations interface built from:

- a fixed branded shell
- contextual team and season controls
- page headers
- segmented tabs
- collapsible compound filters
- translucent cards
- dense but controlled data tables
- compact icon actions with tooltips
- clear competition, schedule, and game-operation semantics

Future work should preserve that structure and extend it, not reset it.
