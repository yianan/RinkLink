# RinkLink Visual Enhancement Plan

Targeted visual improvements to elevate the frontend from "solid SaaS dashboard" to distinctive, memorable product UI. Each item is independent and can be implemented incrementally.

---

## 1. Typography — Replace Inter with distinctive font pairing

**Problem**: Inter is the default "modern SaaS" font — functional but generic. Every second dashboard on the internet uses it.

**Enhancement**:
- Display font for page titles, stat numbers, and section headers: **Plus Jakarta Sans** (geometric, slightly rounded, modern sport feel)
- Keep Inter (or system sans-serif) for body text, table content, and form labels
- Use the display font at `font-semibold` / `font-bold` for impact

**Files**: `index.html` (font load), `styles.css` (font variable), `PageHeader.tsx`, `HomePage.tsx` (stat values)

**Status**: [x] Complete

---

## 2. Stat card visual punch on Dashboard

**Problem**: Icon containers are plain gray (`bg-slate-100`). Large stat numbers use the same font as body text. Cards don't feel like the hero element they should be.

**Enhancement**:
- Tint icon backgrounds to match semantic color (sky for games, amber for proposals, emerald for open dates, violet for practices, fuchsia for record)
- Use display font for the `text-3xl` stat values
- Add colored top-border accent strip to each stat card

**Files**: `HomePage.tsx`

**Status**: [x] Complete

---

## 3. Dark mode card depth

**Problem**: Light mode cards have `shadow-soft`, but dark mode has `shadow-none` with only a border ring. Dark mode feels flat compared to light.

**Enhancement**:
- Add subtle top-edge inset highlight and refined outer glow in dark mode
- Creates the appearance of light catching the card edge, adding depth without brightness

**Files**: `Card.tsx`

**Status**: [x] Complete

---

## 4. Clickable card hover transitions

**Problem**: Clickable cards (`clickableCard` class, dashboard stat/list cards) only get `hover:shadow-md`. No color shift or motion feedback — they feel static.

**Enhancement**:
- Add border color shift toward cyan on hover
- Subtle translate-y lift (`hover:-translate-y-0.5`)
- Transition timing on transform + shadow + border

**Files**: `HomePage.tsx` (`clickableCard` class)

**Status**: [x] Complete

---

## 5. Empty state visual personality

**Problem**: `EmptyState` renders a gray icon box with text. These are dead-end moments that should feel inviting, not stark.

**Enhancement**:
- Replace flat gray icon container with gradient-tinted container matching the page's semantic color
- Add a subtle decorative ring or frost pattern behind the icon
- Slightly larger icon size for visual weight

**Files**: `EmptyState.tsx`

**Status**: [x] Complete

---

## 6. Nav badge attention indicators

**Problem**: Warning badges on Proposals/Schedule are small and static. Easy to miss when scanning the sidebar quickly.

**Enhancement**:
- Add a pulsing dot indicator alongside badge count for items needing attention
- Subtle `animate-pulse` on the dot, not the whole badge (refined, not noisy)

**Files**: `App.tsx` (AppNav component)

**Status**: [x] Complete

---

## 7. Page transitions

**Problem**: Route changes are instant with no visual transition. Makes navigation feel abrupt.

**Enhancement**:
- Add a fade-in + subtle slide-up animation on route mount
- CSS-only using a wrapper `div` with `animate-fadeIn` keyframe
- Keep it fast (150-200ms) so it doesn't feel sluggish

**Files**: `styles.css` (keyframe), `App.tsx` (route wrapper)

**Status**: [x] Complete

---

## 8. Table header visual rhythm

**Problem**: Every table uses identical `bg-slate-50 text-xs uppercase` headers. Visually monotone across pages.

**Enhancement**:
- Add a subtle bottom border accent on table headers (2px gradient line from cyan to violet)
- Slightly more contrast in dark mode header background

**Files**: `styles.css` (utility class), pages with tables

**Status**: [x] Complete

---

## 9. Primary button vibrancy in dark mode

**Problem**: Button gradient `from-cyan-600 via-sky-600 to-violet-600` looks washed out against dark backgrounds. CTAs don't pop enough.

**Enhancement**:
- Brighten dark mode gradient stops (use 400-level colors instead of reversing to light)
- Add subtle glow shadow matching gradient colors in dark mode
- Keep light mode as-is

**Files**: `Button.tsx`

**Status**: [x] Complete

---

## 10. Brand favicon

**Problem**: Still using default Vite SVG favicon. Missed branding opportunity.

**Enhancement**:
- Create a simple snowflake-in-circle SVG mark
- Use brand colors (cyan-to-violet gradient)
- Replace in `index.html`

**Files**: `index.html`, new `public/favicon.svg`

**Status**: [x] Complete

---

## Implementation Order

| # | Enhancement | Impact | Effort |
|---|------------|--------|--------|
| 1 | Typography | High | Small |
| 2 | Stat cards | High | Small |
| 3 | Dark mode cards | Medium | Small |
| 4 | Card hover | Medium | Small |
| 5 | Empty states | Medium | Small |
| 6 | Nav badges | Low | Small |
| 7 | Page transitions | Medium | Small |
| 8 | Table headers | Low | Small |
| 9 | Button vibrancy | Medium | Small |
| 10 | Favicon | Low | Small |
