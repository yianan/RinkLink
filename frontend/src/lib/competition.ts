import { BadgeProps } from '../components/ui/Badge';

export function getCompetitionLabel(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'League';
    case 'non_league':
      return 'Non-League';
    case 'showcase':
      return 'Showcase';
    case 'tournament':
      return 'Tournament';
    case 'state_tournament':
      return 'State Tournament';
    case 'district':
      return 'District';
    case 'scrimmage':
      return 'Scrimmage';
    case 'festival':
      return 'Festival';
    default:
      return value || '—';
  }
}

export function getCompetitionBadgeVariant(value: string | null | undefined): BadgeProps['variant'] {
  switch (value) {
    case 'league':
      return 'info';
    case 'state_tournament':
    case 'district':
      return 'warning';
    case 'showcase':
    case 'tournament':
      return 'success';
    case 'festival':
      return 'accent';
    case 'scrimmage':
    case 'non_league':
    default:
      return 'neutral';
  }
}

export function getCompetitionShellClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/80 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/75 dark:border-sky-900/40 dark:from-sky-950/25 dark:via-slate-950 dark:to-cyan-950/20';
    case 'state_tournament':
      return 'border-amber-200/80 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/70 dark:border-amber-900/40 dark:from-amber-950/25 dark:via-slate-950 dark:to-orange-950/20';
    case 'district':
      return 'border-orange-200/80 bg-gradient-to-br from-orange-50/95 via-white to-amber-50/70 dark:border-orange-900/40 dark:from-orange-950/25 dark:via-slate-950 dark:to-amber-950/20';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/70 dark:border-emerald-900/40 dark:from-emerald-950/25 dark:via-slate-950 dark:to-teal-950/20';
    case 'festival':
      return 'border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/70 dark:border-violet-900/40 dark:from-violet-950/25 dark:via-slate-950 dark:to-fuchsia-950/20';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-[var(--app-surface)]';
  }
}

export function getCompetitionHeaderClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/80 bg-sky-50/90 dark:border-sky-900/50 dark:bg-sky-950/25';
    case 'state_tournament':
      return 'border-amber-200/80 bg-amber-50/90 dark:border-amber-900/50 dark:bg-amber-950/25';
    case 'district':
      return 'border-orange-200/80 bg-orange-50/90 dark:border-orange-900/50 dark:bg-orange-950/25';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-900/50 dark:bg-emerald-950/25';
    case 'festival':
      return 'border-violet-200/80 bg-violet-50/90 dark:border-violet-900/50 dark:bg-violet-950/25';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-white/90 dark:bg-slate-950/40';
  }
}

export function getDivisionShellClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/80 bg-white/80 dark:border-sky-900/35 dark:bg-slate-950/45';
    case 'state_tournament':
      return 'border-amber-200/80 bg-white/80 dark:border-amber-900/35 dark:bg-slate-950/45';
    case 'district':
      return 'border-orange-200/80 bg-white/80 dark:border-orange-900/35 dark:bg-slate-950/45';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/80 bg-white/80 dark:border-emerald-900/35 dark:bg-slate-950/45';
    case 'festival':
      return 'border-violet-200/80 bg-white/80 dark:border-violet-900/35 dark:bg-slate-950/45';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-[var(--app-surface-strong)]';
  }
}

export function getDivisionHeaderClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'border-sky-200/70 bg-sky-50/95 dark:border-sky-900/35 dark:bg-sky-950/20';
    case 'state_tournament':
      return 'border-amber-200/70 bg-amber-50/95 dark:border-amber-900/35 dark:bg-amber-950/20';
    case 'district':
      return 'border-orange-200/70 bg-orange-50/95 dark:border-orange-900/35 dark:bg-orange-950/20';
    case 'showcase':
    case 'tournament':
      return 'border-emerald-200/70 bg-emerald-50/95 dark:border-emerald-900/35 dark:bg-emerald-950/20';
    case 'festival':
      return 'border-violet-200/70 bg-violet-50/95 dark:border-violet-900/35 dark:bg-violet-950/20';
    default:
      return 'border-[color:var(--app-border-subtle)] bg-slate-50/90 dark:bg-slate-900/70';
  }
}

export function getCompetitionTitleClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'text-sky-900 dark:text-sky-100';
    case 'state_tournament':
      return 'text-amber-900 dark:text-amber-100';
    case 'district':
      return 'text-orange-900 dark:text-orange-100';
    case 'showcase':
    case 'tournament':
      return 'text-emerald-900 dark:text-emerald-100';
    case 'festival':
      return 'text-violet-900 dark:text-violet-100';
    default:
      return 'text-slate-900 dark:text-slate-100';
  }
}

export function getCompetitionLabelClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'text-sky-700 dark:text-sky-300';
    case 'state_tournament':
      return 'text-amber-700 dark:text-amber-300';
    case 'district':
      return 'text-orange-700 dark:text-orange-300';
    case 'showcase':
    case 'tournament':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'festival':
      return 'text-violet-700 dark:text-violet-300';
    default:
      return 'text-slate-600 dark:text-slate-300';
  }
}

export function getDivisionTitleClass(value: string | null | undefined) {
  switch (value) {
    case 'league':
      return 'text-sky-800 dark:text-sky-100';
    case 'state_tournament':
      return 'text-amber-800 dark:text-amber-100';
    case 'district':
      return 'text-orange-800 dark:text-orange-100';
    case 'showcase':
    case 'tournament':
      return 'text-emerald-800 dark:text-emerald-100';
    case 'festival':
      return 'text-violet-800 dark:text-violet-100';
    default:
      return 'text-slate-900 dark:text-slate-100';
  }
}
