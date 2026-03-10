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

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const monthIndex = parseInt(match[2], 10) - 1;
  const day = match[3] ? parseInt(match[3], 10) : 1;
  return new Date(year, monthIndex, day);
}

/**
 * Formats a date string (YYYY-MM-DD or ISO datetime) using the browser's locale.
 * Parses the date portion only via a local Date constructor to avoid
 * UTC-to-local offset shifting the displayed day.
 */
export function formatDate(value: string | null | undefined): string | null {
  const d = parseLocalDate(value);
  if (!d) return value ?? null;
  return d.toLocaleDateString();
}

export function formatMonthYear(value: string | null | undefined): string | null {
  const d = parseLocalDate(value);
  if (!d) return value ?? null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatWeekdayDate(value: string | null | undefined): string | null {
  const d = parseLocalDate(value);
  if (!d) return value ?? null;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
