# RinkLink UX/UI Comprehensive Review & Improvement Plan

## Current State Assessment

RinkLink has a solid foundation: a cohesive dark-first design system, consistent component library, well-structured page archetypes, and clear visual hierarchy. The application successfully avoids generic CRUD aesthetics and feels purpose-built for hockey operations. The design spec document is thorough and well-considered.

That said, after reviewing every major page and component, there are meaningful improvements across navigation, information architecture, interaction patterns, visual polish, and mobile experience.

---

## 1. Navigation & Information Architecture

### 1.1 Sidebar is flat and long (12 items, no grouping)

**Problem**: All 12 nav items sit at the same level. A team manager scanning for "Proposals" has to visually parse the entire list. The sidebar doesn't communicate workflow relationships (e.g., Schedule > Find Opponents > Proposals is a pipeline).

**Improvement**:
- Group nav items into labeled sections:
  - **Overview**: Dashboard
  - **Team**: Roster, Schedule, Games, Practice
  - **Matchmaking**: Find Opponents, Proposals
  - **League**: Competitions, Standings, Teams
  - **Admin**: Associations, Rinks
- Use small uppercase section labels (like the table headers already in the system) with 8px vertical spacing between groups
- Collapsible groups on mobile drawer for faster scanning

### 1.2 No breadcrumbs or contextual navigation

**Problem**: The Game Scoresheet page (`/games/:gameId`) has a manual "Back" button. There's no breadcrumb trail showing `Games > Game Scoresheet`. Users navigating deep lose context.

**Improvement**:
- Add a lightweight breadcrumb component for detail/child pages (Game Scoresheet, Ice Slots)
- Keep it minimal: just `parent > current` with the parent as a link
- Replace the explicit "Back" button with the breadcrumb itself

### 1.3 No notification indicators in navigation

**Problem**: The sidebar shows "Proposals" with no indication that there are 3 pending incoming proposals requiring action. Users must navigate to the page to discover urgency.

**Improvement**:
- Add unread/pending count badges to nav items for Proposals (pending incoming count) and Schedule (unconfirmed games this week)
- Use small numeric badges (the existing Badge component with `accent` or `warning` variant, scaled to `text-[10px]`)

---

## 2. Dashboard (HomePage)

### 2.1 Stat cards lack sparkline context

**Problem**: "Upcoming Games: 5" is useful but doesn't convey trend or urgency. Is 5 a lot for this point in the season?

**Improvement**:
- Add a secondary line to stat cards: e.g., "3 this week" under Upcoming Games, "2 incoming" under Pending Proposals
- This requires no new API calls — the data is already fetched

### 2.2 No "needs attention" priority section

**Problem**: The dashboard treats everything equally. An unconfirmed game for tomorrow should be more prominent than a practice booking next month.

**Improvement**:
- Add an "Action Required" card above the summary cards for high-priority items:
  - Incoming proposals awaiting response
  - Games this week not yet confirmed
  - Open dates with no time set
- Use warning-tinted card background with clear CTA buttons
- Limit to 3-5 items max; link to full list

### 2.3 Upcoming games card shows raw dates

**Problem**: Dates display as `2026-03-14` instead of human-readable format like `Sat, Mar 14`. The `formatDate` utility exists but the display could be more scannable.

**Improvement**:
- Use relative labels for near dates: "Tomorrow", "This Saturday", "Next Wed"
- Show day-of-week for all dates within 2 weeks
- Highlight "today" and "tomorrow" games with subtle accent background

---

## 3. Schedule Page

### 3.1 Calendar view is card-based, not a real calendar

**Problem**: The "Season Calendar" tab shows cards grouped by month, which is useful but doesn't give the spatial/temporal intuition of a real calendar grid. Users can't see gaps between dates or weekly rhythm.

**Improvement**:
- Replace or supplement the card view with a month-grid calendar view where:
  - Each day cell shows the entry type (home/away dot or color) and status
  - Empty days are visible, making gaps obvious
  - Clicking a day opens the entry or the "Add Entry" modal pre-filled with that date
- Keep the current card view as an alternate mode for users who prefer it

### 3.2 Schedule entries show ISO dates on mobile

**Problem**: Mobile card view shows dates as `2026-03-14` rather than `Sat, Mar 14`. The desktop table also shows ISO format. The `formatWeekdayDate` helper exists but isn't used consistently.

**Improvement**:
- Use `formatWeekdayDate` everywhere in the schedule view
- On mobile, make the date the most prominent element in each card

### 3.3 Action buttons are hard to discover on mobile

**Problem**: "Find Opponents", "Block", "Confirm", "Cancel Game" appear as tiny text links on mobile cards. They're easy to miss.

**Improvement**:
- Use small Button components (size `sm`) instead of raw text links
- Group actions in a horizontal pill bar at the bottom of each mobile card
- Use consistent icon+text pattern matching the desktop action buttons

---

## 4. Game Scoresheet (GamePage)

### 4.1 Score entry is buried and undersized

**Problem**: The score block is a small card with two text inputs. For the single most important piece of data on this page, it doesn't have enough visual weight.

**Improvement**:
- Make the score block a hero-style component: large, centered numbers (text-5xl or larger) with team names flanking a "vs" divider
- Use inline-editable large text instead of small input boxes
- Add a prominent "Final" badge when the game status is final

### 4.2 Multiple separate save buttons

**Problem**: Score, Player Stats, and Goalie Stats each have their own save icon button. Users must remember to save each section independently. Easy to forget one.

**Improvement**:
- Add a floating/sticky "Save All Changes" button that appears when any section has unsaved edits
- Track dirty state per section and show which sections have unsaved changes
- Keep individual save buttons as a secondary option but make the global save primary

### 4.3 Player stats table is wide and repetitive

**Problem**: Two side-by-side stat tables with identical column structures take significant vertical space on mobile (they stack) and require horizontal scrolling on narrow desktop widths.

**Improvement**:
- Use +/- stepper buttons instead of number inputs for G, A, SOG — faster for live game entry
- Add row-level highlight when a player has stats (non-zero values)
- Consider a compact "quick entry" mode for live game scoring: show only jersey number and G/A/SOG in a tighter grid

---

## 5. Find Opponents (SearchPage)

### 5.1 Search form is dense and not progressive

**Problem**: The search card shows 7 fields at once (date, distance, rink, search button, level, ranking min, ranking max). Most searches only need date + distance.

**Improvement**:
- Show primary fields first (date, distance, search button) on one row
- Collapse Level, Rink, and Ranking into an "Advanced Filters" expandable section
- This reduces cognitive load for the 80% case

### 5.2 Auto-match results lack urgency cues

**Problem**: Auto-matches are listed without any prioritization. A match for tomorrow should be more prominent than one for next month.

**Improvement**:
- Sort auto-matches by date (soonest first) — appears to be default but should be explicit
- Add "This week" / "Next week" grouping headers
- Highlight matches where the opponent's ranking is close to the user's team ranking (good competitive match)

### 5.3 Proposal modal could show more match context

**Problem**: The proposal modal shows "vs Team X on Date Y" and form fields, but doesn't show why this is a good match (distance, level, ranking).

**Improvement**:
- Add a mini summary card at the top of the proposal modal showing: opponent ranking, distance, level, and any existing game history
- This gives confidence before sending

---

## 6. Proposals Page

### 6.1 No visual distinction between incoming and outgoing proposals in the unified view

**Problem**: On the "History" tab, proposals from both directions look identical. Users can't quickly scan which ones they sent vs. received.

**Improvement**:
- Add a directional indicator: subtle left-border color (e.g., cyan for sent, amber for received)
- Or add a small "Sent" / "Received" badge in the status column

### 6.2 Accepted tab lacks next-step guidance

**Problem**: Accepted proposals just sit in a table. There's no prompt to confirm the game or check ice availability.

**Improvement**:
- For accepted proposals where the game hasn't been confirmed yet, show a "Confirm this week" CTA
- Link directly to the game detail page if one exists

---

## 7. Global UX Patterns

### 7.1 Loading states are plain text

**Problem**: "Loading schedule...", "Loading proposals..." are plain text strings. They work but feel static and don't convey activity.

**Improvement**:
- Add a subtle skeleton loader pattern: 3-4 placeholder rows with animated shimmer matching the card/table pattern
- Keep it lightweight — the existing translucent card style with a pulse animation on 2-3 placeholder blocks
- This makes loading feel faster and smoother

### 7.2 Empty states are functional but uninspiring

**Problem**: "No upcoming scheduled games." is clear but doesn't guide the user toward the next step.

**Improvement**:
- Add contextual CTAs to empty states:
  - Games empty → "Add your first game from the Schedule page" with a button
  - Proposals empty → "Find opponents to send your first proposal" with a button
  - Roster empty → "Add players or upload a CSV" with both options
- Use a centered layout with a relevant icon and muted illustration-like styling

### 7.3 Confirmation dialogs use browser `confirm()`

**Problem**: `confirm('Cancel the game vs opponent?')` uses the native browser dialog. This breaks the design language and can't be styled. It's also jarring on mobile.

**Improvement**:
- Replace all `confirm()` calls with the existing Modal component in a "confirmation" pattern
- Create a small `ConfirmDialog` component wrapping Modal with destructive/primary button variants
- This keeps the user in the app's visual world

### 7.4 No toast/snackbar feedback for actions

**Problem**: After accepting a proposal, saving a score, or deleting an entry, there's no visible success feedback. The data just silently refreshes.

**Improvement**:
- Add a toast notification system (lightweight, bottom-right positioned)
- Show brief confirmations: "Proposal accepted", "Score saved", "Entry deleted"
- Use the existing semantic colors (success for confirmations, info for neutral actions)

### 7.5 No keyboard shortcuts

**Problem**: Power users (team managers who use this daily) have no keyboard shortcuts for common actions.

**Improvement** (lower priority):
- Add `Cmd+K` / `Ctrl+K` command palette for quick navigation
- Support `n` for "new" (new schedule entry, new player, etc.) on relevant pages

---

## 8. Visual Polish

### 8.1 Date formatting inconsistency

**Problem**: Some pages show `2026-03-14`, others show `Mar 14, 2026`, and the Game Scoresheet shows `Saturday, Mar 14, 2026`. The helpers exist but aren't applied uniformly.

**Improvement**:
- Standardize: tables use `Mar 14` (short), headers use `Sat, Mar 14, 2026` (full), mobile cards use `Sat, Mar 14`
- Audit all pages for consistency

### 8.2 The `filterButtonClass` is duplicated across 5+ pages

**Problem**: The exact same long Tailwind class string for the filter button is copy-pasted in SchedulePage, ProposalsPage, CompetitionsPage, GamesPage, etc.

**Improvement**:
- Extract to a shared constant in `lib/uiClasses.ts` (where `accentActionClass` and `accentLinkClass` already live)
- Or create a `FilterButton` wrapper component

### 8.3 Table row actions could use better affordances

**Problem**: Ghost icon buttons in table action columns have very low visual weight. It's not immediately clear they're interactive.

**Improvement**:
- Add a slight opacity increase on row hover for the action buttons
- Consider showing action buttons only on row hover (desktop) to reduce visual noise
- Keep them always visible on mobile

---

## 9. Mobile Experience

### 9.1 Header gets crowded on small screens

**Problem**: The header contains hamburger + logo/tagline + team switcher + season switcher + theme toggle. On narrow phones, this is tight.

**Improvement**:
- Hide the tagline ("Ice time & scheduling") on mobile — the brand name is sufficient
- Move the theme toggle into the mobile drawer menu
- This frees ~80px of header width

### 9.2 Team and Season switchers need larger touch targets

**Problem**: The select dropdowns in the header are standard browser selects, which work but have small touch targets.

**Improvement**:
- Increase minimum height to 40px on mobile (currently varies)
- Consider using custom styled selects that match the design system better on mobile

### 9.3 Mobile cards could use swipe actions

**Problem**: On mobile, schedule entries, proposals, and games show action buttons below the card content. This takes vertical space.

**Improvement** (lower priority):
- Explore swipe-to-reveal patterns for common actions (swipe right to confirm, swipe left to delete)
- This would reduce card height and speed up mobile workflows

---

## 10. Accessibility

### 10.1 Focus management after modal close

**Problem**: When a modal closes, focus doesn't return to the trigger button consistently.

**Improvement**:
- Ensure all Modal uses return focus to the element that opened them
- This is standard ARIA dialog behavior

### 10.2 Color-only status indicators

**Problem**: Some status information is conveyed primarily through badge color (success=green, warning=amber). Users with color vision deficiency may not distinguish these.

**Improvement**:
- Ensure all colored badges also have distinct text labels (which they mostly do — this is already good)
- Consider adding subtle icon prefixes to critical status badges (checkmark for confirmed, clock for pending)

---

## Implementation Priority

| Priority | Area | Items | Effort |
|----------|------|-------|--------|
| **P0 - Quick wins** | Polish | Date formatting consistency, filterButtonClass extraction, replace `confirm()` with ConfirmDialog | Small |
| **P1 - High impact** | Dashboard | Action Required section, stat card secondary lines | Small-Medium |
| **P1 - High impact** | Global | Toast notification system, skeleton loading states | Medium |
| **P1 - High impact** | Navigation | Sidebar grouping, notification badges | Small-Medium |
| **P2 - Meaningful** | Schedule | Real calendar grid view, consistent date formatting | Medium |
| **P2 - Meaningful** | Scoresheet | Hero score block, floating save button | Medium |
| **P2 - Meaningful** | Search | Progressive disclosure of search filters | Small |
| **P2 - Meaningful** | Mobile | Header cleanup, empty state CTAs | Small |
| **P3 - Nice to have** | Global | Command palette (Cmd+K), swipe actions on mobile | Large |
| **P3 - Nice to have** | Accessibility | Focus management audit, icon-augmented badges | Small-Medium |

---

## Suggested Build Order

1. Extract `filterButtonClass` and create `ConfirmDialog` component (P0)
2. Standardize date formatting across all pages (P0)
3. Add sidebar nav grouping with section labels (P1)
4. Add toast notification system (P1)
5. Dashboard "Action Required" section and stat card secondary lines (P1)
6. Skeleton loading states for tables and cards (P1)
7. Nav badge counts for Proposals and Schedule (P1)
8. Replace browser `confirm()` calls with ConfirmDialog across all pages (P0, depends on step 1)
9. Hero score block on Game Scoresheet (P2)
10. Calendar grid view for Schedule page (P2)
11. Progressive search filter disclosure on Find Opponents (P2)
12. Mobile header cleanup and empty state CTAs (P2)
13. Floating "Save All" button on Game Scoresheet (P2)
14. Command palette (P3)
15. Swipe actions on mobile (P3)
16. Accessibility audit: focus management and icon-augmented badges (P3)
