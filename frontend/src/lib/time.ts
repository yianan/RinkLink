export function formatTimeHHMM(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

