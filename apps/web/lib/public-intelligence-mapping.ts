// =============================================================================
// HSI Phase 43 — public-intelligence category mapping (PURE, no I/O).
//
// Normalizes the many internal signal/publication category strings into the six
// PUBLIC narrative buckets shown on the homepage globe + feed, and derives the
// presentational risk level / badge tone / node color for each. Pure functions
// only (no DB, no Next, no env) so they are trivially unit-testable and safe to
// import from anywhere. This is presentation logic — it never invents data.
// =============================================================================

export const CATEGORY_BUCKETS = [
  'Influence',
  'Recruitment',
  'Misinformation',
  'Propaganda',
  'Extremism',
  'Other',
] as const;

export type CategoryBucket = (typeof CATEGORY_BUCKETS)[number];

/** Map an arbitrary internal category string to one of the six public buckets. */
export function bucketOf(raw: string | null | undefined): CategoryBucket {
  const s = (raw ?? '').toLowerCase();
  if (!s) return 'Other';
  if (s.includes('recruit')) return 'Recruitment';
  if (s.includes('misinfo')) return 'Misinformation';
  if (s.includes('disinfo')) return 'Misinformation';
  if (s.includes('propaganda')) return 'Propaganda';
  if (s.includes('extrem') || s.includes('radical') || s.includes('violen') || s.includes('terror')) return 'Extremism';
  if (
    s.includes('influence') ||
    s.includes('ideolog') ||
    s.includes('coordinat') ||
    s.includes('mobiliz') ||
    s.includes('narrative') ||
    s.includes('targeting') ||
    s.includes('financ')
  ) {
    return 'Influence';
  }
  return 'Other';
}

/** Presentational 1–5 risk level for a bucket (severity-ordered, deterministic). */
export function riskForBucket(bucket: CategoryBucket): 1 | 2 | 3 | 4 | 5 {
  switch (bucket) {
    case 'Extremism': return 5;
    case 'Recruitment': return 4;
    case 'Propaganda': return 4;
    case 'Misinformation': return 3;
    case 'Influence': return 3;
    case 'Other': return 2;
  }
}

/** Badge tone (matches @hsi/ui CategoryTone) for a bucket. */
export function toneForBucket(bucket: CategoryBucket): 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'neutral' {
  switch (bucket) {
    case 'Influence': return 'blue';
    case 'Recruitment': return 'orange';
    case 'Misinformation': return 'green';
    case 'Propaganda': return 'purple';
    case 'Extremism': return 'red';
    case 'Other': return 'neutral';
  }
}

/** Globe node color (hex) for a bucket. */
export function colorForBucket(bucket: CategoryBucket): string {
  switch (bucket) {
    case 'Influence': return '#3B82F6';
    case 'Recruitment': return '#F59E0B';
    case 'Misinformation': return '#06B6D4';
    case 'Propaganda': return '#8B5CF6';
    case 'Extremism': return '#EF4444';
    case 'Other': return '#94A3B8';
  }
}

export interface CategoryActivity {
  category: CategoryBucket;
  count: number;
}

/**
 * Tally a list of raw category strings into the six buckets, returned in the
 * fixed bucket order with their counts (0 included). Returns an empty array when
 * there is no input (so callers can fall back to the decorative default).
 */
export function normalizeCategoryActivity(raw: Array<string | null | undefined>): CategoryActivity[] {
  if (raw.length === 0) return [];
  const tally = new Map<CategoryBucket, number>();
  for (const b of CATEGORY_BUCKETS) tally.set(b, 0);
  for (const r of raw) {
    const b = bucketOf(r);
    tally.set(b, (tally.get(b) ?? 0) + 1);
  }
  return CATEGORY_BUCKETS.map((category) => ({ category, count: tally.get(category) ?? 0 }));
}

/**
 * Distribute `n` globe nodes across the buckets proportionally to their counts
 * (largest-remainder), so node colors reflect real narrative frequency. Falls
 * back to an even spread when there is no activity. Deterministic.
 */
export function distributeNodes(n: number, activity: CategoryActivity[]): CategoryBucket[] {
  const present = activity.filter((a) => a.count > 0);
  if (n <= 0) return [];
  if (present.length === 0) {
    // Even, deterministic spread across all buckets.
    return Array.from({ length: n }, (_, i) => CATEGORY_BUCKETS[i % CATEGORY_BUCKETS.length]);
  }
  const total = present.reduce((sum, a) => sum + a.count, 0);
  const raw = present.map((a) => ({ bucket: a.category, exact: (a.count / total) * n }));
  const base = raw.map((r) => ({ bucket: r.bucket, count: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }));
  let assigned = base.reduce((s, b) => s + b.count, 0);
  // Hand out the remaining slots to the largest remainders.
  const order = [...base].sort((a, b) => b.rem - a.rem);
  let i = 0;
  while (assigned < n && order.length > 0) {
    order[i % order.length].count += 1;
    assigned += 1;
    i += 1;
  }
  const out: CategoryBucket[] = [];
  for (const b of base) for (let k = 0; k < b.count; k++) out.push(b.bucket);
  // Pad defensively (rounding edge cases) so the result is always length n.
  while (out.length < n) out.push(present[0].category);
  return out.slice(0, n);
}
