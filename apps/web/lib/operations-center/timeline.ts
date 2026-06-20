// =============================================================================
// HSI Phase 73 — Operations timeline helpers (PURE). Counts existing timestamps
// into last-7d / last-30d windows. No new storage, no fabrication. No I/O.
// =============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

export function withinDays(iso: string | null | undefined, nowIso: string, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime(); const now = new Date(nowIso).getTime();
  if (Number.isNaN(t) || Number.isNaN(now)) return false;
  return now - t <= days * DAY_MS && t <= now;
}

/** Count timestamps falling in the last 7d and last 30d. */
export function windowCounts(timestamps: Array<string | null | undefined>, nowIso: string): { last7: number; last30: number } {
  let last7 = 0; let last30 = 0;
  for (const ts of timestamps) {
    if (withinDays(ts, nowIso, 30)) { last30++; if (withinDays(ts, nowIso, 7)) last7++; }
  }
  return { last7, last30 };
}
