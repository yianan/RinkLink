export const timeLabel = (start: string | null, end: string | null) =>
  `${start?.slice(0, 5) || "Any time"}${end ? `–${end.slice(0, 5)}` : ""}`;
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
