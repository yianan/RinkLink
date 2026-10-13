import { cn } from "../lib/cn";
import { focusRingClass } from "../lib/uiClasses";

// Reuse the full application styling hooks and theme tokens.
export const authViewClassNames = {
    base: 'rinklink-auth-card',
    header: 'rinklink-auth-header',
    title: 'rinklink-auth-title',
    description: 'rinklink-auth-description',
    content: 'rinklink-auth-content',
    footer: 'rinklink-auth-footer',
    footerLink: 'rinklink-auth-footer-link',
    continueWith: 'rinklink-auth-continue',
    separator: 'rinklink-auth-separator',
    form: {
      base: 'rinklink-auth-form',
      input: 'rinklink-auth-input',
      label: 'rinklink-auth-label',
      error: 'rinklink-auth-error',
      forgotPasswordLink: 'rinklink-auth-forgot-link',
      primaryButton: 'rinklink-auth-primary-button',
      outlineButton: 'rinklink-auth-outline-button',
      providerButton: 'rinklink-auth-provider-button',
      secondaryButton: 'rinklink-auth-secondary-button',
      button: 'rinklink-auth-button',
    },
  } as const;

export function navigationClass(active: boolean) {
  return cn("group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors", focusRingClass,
    active
                        ? "bg-gradient-to-r from-white via-white to-[color:color-mix(in_srgb,var(--app-surface-strong)_82%,rgb(237_233_254))] text-slate-900 shadow-sm ring-1 ring-[color:var(--app-border-subtle)] before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-full before:bg-[color:var(--app-accent-link)] before:content-[''] dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 dark:text-slate-100 dark:shadow-none"
                        : 'text-slate-700 hover:bg-white/70 hover:text-slate-900 hover:ring-1 hover:ring-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-900/40 dark:hover:text-slate-100 dark:hover:ring-slate-700/70',);
}


export const actionLinkClass = cn(
  "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-all",
  focusRingClass,
  'border border-slate-300/90 bg-white/95 text-slate-800 shadow-sm backdrop-blur-[1px] hover:border-[color:var(--app-accent-link)]/35 hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_8%,white)] hover:text-[color:var(--app-accent-link-hover)] hover:ring-1 hover:ring-[color:var(--app-accent-link)]/15 disabled:border-[color:var(--app-border-subtle)] disabled:bg-[var(--app-disabled-surface)] disabled:text-[color:var(--app-disabled-text)] dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-[color:var(--app-accent-link)]/45 dark:hover:bg-[color:color-mix(in_srgb,var(--app-accent-link)_14%,transparent)] dark:hover:text-[color:var(--app-accent-link)] dark:hover:ring-[color:var(--app-accent-link)]/20',
);
