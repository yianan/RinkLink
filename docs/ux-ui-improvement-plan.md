# RinkLink UX/UI Improvement Plan

All planned items have been implemented. This document tracks what was completed across each phase.

---

## Completed (Phase 1)

- **1.1** Sidebar grouped into Overview / Team / Matchmaking / League / Admin sections with section labels
- **1.2** Breadcrumb component replacing "Back" buttons on detail pages
- **1.3** Nav badge counts on Proposals (incoming) and Schedule (unconfirmed)
- **2.1** Stat card secondary lines ("3 this week", "2 incoming")
- **2.2** "Needs Attention" amber card on dashboard with incoming proposals, unconfirmed games, missing times
- **2.3** Contextual date formatting (Today / Tomorrow / weekday labels / "Next Wed" / "Mar 14")
- **3.1** Real calendar grid view with color-coded entries and clickable day cells
- **3.2** Consistent `formatShortDate` across schedule views
- **5.1** Progressive disclosure: "Advanced Filters" toggle hiding Rink/Level/Ranking
- **7.1** Skeleton loading (TableSkeleton, CardListSkeleton) on all major pages
- **7.2** EmptyState component with contextual CTAs across all pages
- **7.3** ConfirmDialog component + async context replacing all browser `confirm()` calls
- **7.4** Toast notification system (success/info/warning/error, auto-dismiss, portal-rendered)
- **7.5** Command palette deferred with documented plan (`docs/command-palette-plan.md`)
- **8.1** Date formatting standardized with `formatShortDate`, `formatHeaderDate`, `formatContextualDate`
- **8.2** `filterButtonClass` extracted to `lib/uiClasses.ts`
- **8.3** `tableActionButtonClass` with hover opacity transitions extracted to shared utilities
- **9.1** Mobile header cleanup: tagline hidden, theme toggle moved to drawer
- **10.1** Modal focus management: saves and restores `lastActiveElementRef`
- **4.1** Hero score block: text-4xl centered score display with team names, "Final" label, styled card
- **4.2** Floating "Save All Changes" sticky bar with `handleSaveAll` saving all dirty sections
- **4.3 (partial)** Player stat row highlights for non-zero stats (`bg-cyan-50/50`)

## Completed (Phase 2)

- **3.3** Mobile schedule action buttons: replaced text links with `Button` components (size `sm`) with icon+text
- **5.2** Auto-match urgency grouping: "This Week" / "Next Week" / "Later" section headers in both mobile and desktop views, soonest-first sort enforced
- **5.3** Proposal modal match context: styled summary card showing opponent name, date, distance, level, and ranking
- **6.1** Proposal history direction indicators: "Sent" / "Received" badges with arrow icons on History tab (both mobile and desktop)
- **6.2** Accepted proposals next-step guidance: "View Schedule" CTA button on Accepted tab (both mobile and desktop)
- **10.2** Icon-augmented status badges on GamesPage: `getGameStatusIcon` icons rendered in Badge `icon` prop on both mobile cards and desktop table

## Completed (Phase 3)

- **9.2** Larger mobile touch targets: header team/season selects set to `min-h-11` (44px) on mobile, `min-h-10` on desktop

## Deferred

- **4.3** Player stats +/- steppers: deferred per user preference (current number inputs are sufficient)
- **9.3** Mobile swipe actions: deferred (requires gesture library, large effort)
