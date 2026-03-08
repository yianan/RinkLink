# Frontend Tailwind v4 Native Migration Plan

The frontend currently runs on Tailwind CSS 4 tooling, but still uses the compatibility bridge through `@config` and the legacy `tailwind.config.ts` theme definition.

This plan is for completing a full native Tailwind v4 migration later, without re-discovering the work.

## Goals

- Remove the compatibility bridge
- Move theme definition into CSS
- Keep dark/light mode working
- Preserve the current visual design while simplifying the styling architecture

## Plan

1. Move theme definition into CSS
- Port `brand` colors, fonts, shadows, and other `theme.extend` values from `frontend/tailwind.config.ts` into `@theme` tokens in `frontend/src/styles.css`

2. Replace legacy shared utility classes
- Rework `container-page`, `page-title`, `page-subtitle`, and similar shared classes so they are either plain CSS backed by theme tokens or replaced with inline utilities where cleaner

3. Audit and reduce `@apply`
- Review every `@apply` block in `frontend/src/styles.css`
- Convert anything that depends on legacy config behavior into Tailwind v4-native CSS or direct utility usage

4. Review custom interaction widgets
- Validate `rl-tooltip`, `rl-range`, dark-mode backgrounds, gradients, and custom focus/hover states under a pure Tailwind v4 setup

5. Revisit plugin usage
- Confirm whether `@tailwindcss/forms` and `@tailwindcss/typography` are still worth keeping
- Replace them with explicit local styling if that provides cleaner control

6. Remove compatibility bridge
- Delete `@config` usage from `frontend/src/styles.css`
- Remove or drastically reduce `frontend/tailwind.config.ts`

7. Validate across the app
- Run `npm run build`
- Check dark and light mode
- Spot-check dashboard, schedule, games, proposals, search, rinks, seasons, standings, and mobile layouts

## Notes

- This is a real styling refactor, not just a dependency bump
- The current bridge is acceptable for now and keeps the app building on Tailwind 4
- Migration should be done in deliberate passes, not mixed into unrelated UI work
