// =============================================================================
// Cohort analytics — PURE. Groups organizations by signup month, activation
// month, or plan, and computes retention / engagement / churn per cohort. No DB,
// no clocks.
// =============================================================================

import type { CohortRow } from './types';

export type CohortKey = 'signup_month' | 'activation_month' | 'plan';

export interface CohortMember {
  organizationId: string;
  signupMonth: string | null; // 'YYYY-MM'
  activationMonth: string | null; // 'YYYY-MM'
  planSlug: string;
  retained: boolean; // still active/paying
  engaged: boolean; // had recent activity
}

const labelFor = (m: CohortMember, key: CohortKey): string =>
  key === 'plan' ? m.planSlug : key === 'activation_month' ? (m.activationMonth ?? 'unknown') : (m.signupMonth ?? 'unknown');

/** Group members into cohorts and compute retention/engagement/churn. PURE. */
export function computeCohorts(members: CohortMember[], key: CohortKey = 'signup_month'): CohortRow[] {
  const buckets = new Map<string, CohortMember[]>();
  for (const m of members) {
    const label = labelFor(m, key);
    const arr = buckets.get(label) ?? [];
    arr.push(m);
    buckets.set(label, arr);
  }
  const rows: CohortRow[] = [];
  for (const [cohort, arr] of buckets) {
    const size = arr.length;
    const retained = arr.filter((m) => m.retained).length;
    const engaged = arr.filter((m) => m.engaged).length;
    rows.push({
      cohort,
      size,
      retained,
      churned: size - retained,
      retentionRate: size > 0 ? retained / size : 0,
      engagementRate: size > 0 ? engaged / size : 0,
    });
  }
  // Deterministic order: by cohort label ascending.
  return rows.sort((a, b) => (a.cohort < b.cohort ? -1 : a.cohort > b.cohort ? 1 : 0));
}

/** Derive the 'YYYY-MM' bucket from an ISO timestamp. PURE. */
export function monthBucket(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
