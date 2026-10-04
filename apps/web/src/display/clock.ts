/** "19:04:12" (UTC), for timeline rows. Row timestamps are ISO strings with an offset. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(11, 19);
}
