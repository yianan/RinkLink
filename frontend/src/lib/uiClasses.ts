export const focusRingClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950';

export const fieldControlClass =
  `w-full rounded-lg border border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)] text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition-[border-color,box-shadow,background-color,color] focus:border-cyan-400 focus:ring-[color:var(--app-focus-ring)] disabled:cursor-not-allowed disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:text-slate-100 dark:placeholder:text-slate-500 ${focusRingClass}`;

export const toolbarSelectClass =
  'min-h-11 bg-white/80 shadow-sm ring-1 ring-slate-200/80 sm:min-h-10 dark:bg-slate-950/40 dark:ring-slate-700/60';

export const accentLinkClass =
  `rounded-md text-[color:var(--app-accent-link)] transition-colors hover:text-[color:var(--app-accent-link-hover)] focus-visible:text-[color:var(--app-accent-link-hover)] ${focusRingClass}`;

export const accentActionClass =
  `rounded-md font-medium text-[color:var(--app-accent-link)] transition-colors hover:text-[color:var(--app-accent-link-hover)] focus-visible:text-[color:var(--app-accent-link-hover)] ${focusRingClass}`;

export const subtleLinkClass =
  `rounded-md transition-colors ${focusRingClass}`;

export const interactiveTitleClass =
  'transition-colors group-hover:text-[color:var(--app-accent-link-hover)] group-focus-visible:text-[color:var(--app-accent-link-hover)]';

export const filterButtonClass =
  'h-8 border-slate-300/90 bg-white/95 px-2.5 text-xs text-slate-800 hover:border-[color:var(--app-accent-link)]/35 hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_8%,white)] hover:text-[color:var(--app-accent-link-hover)] hover:ring-[color:var(--app-accent-link)]/15 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-[color:var(--app-accent-link)]/45 dark:hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_14%,transparent)] dark:hover:text-[color:var(--app-accent-link)] dark:hover:ring-[color:var(--app-accent-link)]/20';

export const sectionLabelClass =
  'px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400';

export const tableActionButtonClass =
  `opacity-90 ring-1 ring-transparent transition-all hover:opacity-100 hover:ring-slate-200 hover:bg-slate-100/80 dark:hover:ring-slate-700 dark:hover:bg-slate-900/70 ${focusRingClass}`;

export const destructiveIconButtonClass =
  `text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 ${focusRingClass}`;

export const chromeIconButtonClass =
  `h-9 w-9 bg-slate-900/5 text-slate-700 ring-1 ring-slate-200/70 transition-colors hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_8%,white)] hover:text-[color:var(--app-accent-link-hover)] dark:bg-white/10 dark:text-white dark:ring-white/15 dark:hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_18%,transparent)] dark:hover:text-[color:var(--app-accent-link)] ${focusRingClass}`;

export const segmentedControlClass =
  'inline-flex flex-wrap rounded-xl border border-[color:var(--app-border-subtle)] bg-[var(--app-surface)] p-1 shadow-sm backdrop-blur-[1px]';

export const segmentedControlItemClass =
  `rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:text-[color:var(--app-accent-link-hover)] data-[state=on]:bg-[var(--app-surface-strong)] data-[state=on]:text-[color:var(--app-accent-link-hover)] data-[state=on]:shadow-sm data-[state=on]:ring-1 data-[state=on]:ring-[color:var(--app-border-subtle)] dark:text-slate-400 dark:hover:text-[color:var(--app-accent-link)] dark:data-[state=on]:text-[color:var(--app-accent-link)] ${focusRingClass}`;

export const listRowButtonClass =
  `group w-full rounded-xl text-left transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40 ${focusRingClass}`;

export const selectableRowButtonClass =
  `w-full rounded-xl border border-transparent px-3 py-3 text-left transition-all hover:border-[color:var(--app-accent-link)]/20 hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_6%,white)] dark:hover:border-[color:var(--app-accent-link)]/25 dark:hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_10%,transparent)] ${focusRingClass}`;

export const selectableRowButtonActiveClass =
  'border-[color:var(--app-accent-link)]/25 bg-[color:color-mix(in_srgb,var(--app-accent-link)_10%,white)] text-slate-950 dark:border-[color:var(--app-accent-link)]/30 dark:bg-[color:color-mix(in_srgb,var(--app-accent-link)_16%,transparent)] dark:text-slate-100';

export const compactChipButtonClass =
  `rounded-full border border-current/30 bg-white/90 leading-none text-current transition hover:bg-white hover:shadow-sm dark:border-white/30 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800 ${focusRingClass}`;

export const selectorPillClass =
  `rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${focusRingClass}`;

export const selectorPillIdleClass =
  'border-[color:var(--app-border-subtle)] bg-white/85 text-slate-700 hover:border-[color:var(--app-accent-link)]/40 hover:text-[color:var(--app-accent-link-hover)] dark:bg-slate-950/35 dark:text-slate-300 dark:hover:border-[color:var(--app-accent-link)]/45 dark:hover:text-[color:var(--app-accent-link)]';

export const selectorPillActiveClass =
  'shadow-sm';

export const accentSelectorPillActiveClass =
  'border-[color:var(--app-accent-link)]/30 bg-[color:color-mix(in_srgb,var(--app-accent-link)_12%,white)] text-[color:var(--app-accent-link-hover)] shadow-sm dark:border-[color:var(--app-accent-link)]/35 dark:bg-[color:color-mix(in_srgb,var(--app-accent-link)_20%,transparent)] dark:text-[color:var(--app-accent-link)]';
