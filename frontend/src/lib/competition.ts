import { BadgeProps } from '../components/ui/Badge';

export function getCompetitionLabel(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'League';
    case 'tournament':
      return 'Tournament';
    case 'practice':
      return 'Practice';
    case 'showcase':
      return 'Showcase';
    case 'scrimmage':
      return 'Scrimmage';
    case 'exhibition':
      return 'Exhibition';
    default:
      return value || '—';
  }
}

export function getCompetitionBadgeVariant(value: string | null | undefined): BadgeProps['variant'] {
  switch (value) {
    case 'league':
      return 'info';
    case 'tournament':
    case 'showcase':
      return 'success';
    case 'practice':
      return 'accent';
    case 'exhibition':
    case 'scrimmage':
    default:
      return 'neutral';
  }
}

export function getCompetitionShellClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/80 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/75 dark:border-sky-900/40 dark:from-sky-950/25 dark:via-slate-950 dark:to-cyan-950/20';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/70 dark:border-emerald-900/40 dark:from-emerald-950/25 dark:via-slate-950 dark:to-teal-950/20';
    case 'practice':
      return 'border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/70 dark:border-violet-900/40 dark:from-violet-950/25 dark:via-slate-950 dark:to-fuchsia-950/20';
    case 'scrimmage':
    case 'exhibition':
      return 'border-slate-200/80 bg-gradient-to-br from-slate-50/95 via-white to-zinc-50/70 dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-zinc-950/20';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-[var(--app-surface)]';
  }
}

export function getCompetitionHeaderClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/80 bg-sky-50/90 dark:border-sky-900/50 dark:bg-sky-950/25';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/25';
    case 'practice':
      return 'border-violet-200/80 bg-violet-50/90 dark:border-violet-900/50 dark:bg-violet-950/25';
    case 'scrimmage':
    case 'exhibition':
      return 'border-slate-200/80 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-950/50';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-white/90 dark:bg-slate-950/40';
  }
}

export function getDivisionShellClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/80 bg-white/80 dark:border-sky-900/35 dark:bg-slate-950/45';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/80 bg-white/80 dark:border-emerald-900/35 dark:bg-slate-950/45';
    case 'practice':
      return 'border-violet-200/80 bg-white/80 dark:border-violet-900/35 dark:bg-slate-950/45';
    case 'scrimmage':
    case 'exhibition':
      return 'border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)]';
  }
}

export function getDivisionHeaderClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/70 bg-sky-50/95 dark:border-sky-900/35 dark:bg-sky-950/20';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/70 bg-emerald-50/95 dark:border-emerald-900/35 dark:bg-emerald-950/20';
    case 'practice':
      return 'border-violet-200/70 bg-violet-50/95 dark:border-violet-900/35 dark:bg-violet-950/20';
    case 'scrimmage':
    case 'exhibition':
      return 'border-slate-200/70 bg-slate-50/95 dark:border-slate-800 dark:bg-slate-900/70';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-slate-50/90 dark:bg-slate-900/70';
  }
}

export function getCompetitionTitleClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'text-sky-900 dark:text-sky-100';
    case 'showcase':
    case 'tournament':
      return 'text-emerald-900 dark:text-emerald-100';
    case 'practice':
      return 'text-violet-900 dark:text-violet-100';
    case 'scrimmage':
    case 'exhibition':
      return 'text-slate-900 dark:text-slate-100';
    default:
      return 'text-slate-900 dark:text-slate-100';
  }
}

export function getCompetitionLabelClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'text-sky-700 dark:text-sky-300';
    case 'showcase':
    case 'tournament':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'practice':
      return 'text-violet-700 dark:text-violet-300';
    case 'scrimmage':
    case 'exhibition':
      return 'text-slate-600 dark:text-slate-300';
    default:
      return 'text-slate-600 dark:text-slate-300';
  }
}

export function getDivisionTitleClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'text-sky-800 dark:text-sky-100';
    case 'showcase':
    case 'tournament':
      return 'text-emerald-800 dark:text-emerald-100';
    case 'practice':
      return 'text-violet-800 dark:text-violet-100';
    case 'scrimmage':
    case 'exhibition':
      return 'text-slate-900 dark:text-slate-100';
    default:
      return 'text-slate-900 dark:text-slate-100';
  }
}
