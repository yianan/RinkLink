export function formatTimeHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const h = parseInt(match[1], 10);
  const minutes = match[2];
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${period}`;
}

export function hasInvalidTimeRange(start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return false;
  return end < start;
}

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const monthIndex = parseInt(match[2], 10) - 1;
  const day = match[3] ? parseInt(match[3], 10) : 1;
  return new Date(year, monthIndex, day);
}

function formatDateWithOptions(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string | null {
  const d = parseLocalDate(value);
  if (!d) return value ?? null;
  return d.toLocaleDateString('en-US', options);
}

/**
 * Formats a date string (YYYY-MM-DD or ISO datetime) using the browser's locale.
 * Parses the date portion only via a local Date constructor to avoid
 * UTC-to-local offset shifting the displayed day.
 */
export function formatDate(value: string | null | undefined): string | null {
  return formatDateWithOptions(value, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatMonthYear(value: string | null | undefined): string | null {
  return formatDateWithOptions(value, { month: 'long', year: 'numeric' });
}

export function formatShortDate(value: string | null | undefined): string | null {
  return formatDateWithOptions(value, { month: 'short', day: 'numeric' });
}

export function formatWeekdayDate(value: string | null | undefined): string | null {
  return formatDateWithOptions(value, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatHeaderDate(value: string | null | undefined): string | null {
  return formatDateWithOptions(value, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function formatContextualDate(
  value: string | null | undefined,
  opts?: { includeYear?: boolean; today?: Date },
): string | null {
  const d = parseLocalDate(value);
  if (!d) return value ?? null;
  const today = opts?.today ?? new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const diffDays = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);

  if (isSameLocalDay(d, today)) return 'Today';
  if (isSameLocalDay(d, tomorrow)) return 'Tomorrow';
  if (diffDays > 1 && diffDays <= 7) return formatDateWithOptions(value, { weekday: 'long' });
  if (diffDays > 7 && diffDays <= 14) {
    const weekday = formatDateWithOptions(value, { weekday: 'short' });
    return weekday ? `Next ${weekday}` : null;
  }

  return formatDateWithOptions(value, opts?.includeYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
