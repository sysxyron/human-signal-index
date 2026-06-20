// =============================================================================
// HSI Phase 70.4 — Signal health engine (PURE, deterministic). Classifies a
// signal's lifecycle from REAL graph/narrative activity only. Every rule is
// deterministic; insufficient data → UNKNOWN (never a fabricated status).
// No I/O.
// =============================================================================

import type { SignalHealth, SignalHealthInput, ClassifiedResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_DAYS = 30;

function ageDays(iso: string | null, nowIso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime(); const now = new Date(nowIso).getTime();
  if (Number.isNaN(t) || Number.isNaN(now)) return null;
  return Math.max(0, (now - t) / DAY_MS);
}

/** Deterministic lifecycle. Order: insufficient → contradicted → resolved →
 *  archived → escalating → active → dormant. */
export function computeSignalHealth(input: SignalHealthInput): ClassifiedResult<SignalHealth> {
  const connections = input.totalEdges + input.narrativeCount;

  // ---- insufficient data → UNKNOWN -----------------------------------------
  if (!input.hasNode && connections === 0) {
    return { value: 'UNKNOWN', reason: 'Signal has no graph node and no relationships — insufficient data.' };
  }

  // ---- contradicted (real incoming CONTRADICTS edges) ----------------------
  if (input.incomingContradicts > 0) {
    return { value: 'CONTRADICTED', reason: `${input.incomingContradicts} contradicting edge(s) target this signal.` };
  }

  // ---- resolved (explicit lifecycle edges recorded) ------------------------
  if (input.publishedAsCount > 0) {
    return { value: 'RESOLVED', reason: 'Published into a report (PUBLISHED_AS) — resolution recorded.' };
  }

  // ---- archived (closed historical) ----------------------------------------
  const status = (input.signalStatus ?? '').toLowerCase();
  if (status === 'archived') return { value: 'ARCHIVED', reason: 'Signal status is archived.' };
  if (status === 'rejected' || input.correctedByCount > 0) {
    return { value: 'ARCHIVED', reason: input.correctedByCount > 0 ? 'Corrected/retracted (CORRECTED_BY) — closed.' : 'Signal was rejected — closed historical.' };
  }

  // ---- no relationships at all → UNKNOWN -----------------------------------
  if (connections === 0) {
    return { value: 'UNKNOWN', reason: 'Signal node exists but has no relationships or narratives yet.' };
  }

  // ---- activity-based: escalating / active / dormant -----------------------
  const last = ageDays(input.lastActivityAt, input.nowIso);
  if (input.recentActivity === 0) {
    if (last == null || last > ACTIVE_WINDOW_DAYS) return { value: 'DORMANT', reason: last == null ? 'Has relationships but no dated activity.' : `No activity in ${Math.round(last)}d.` };
  }
  if (input.recentActivity > input.priorActivity && input.recentActivity > 0) {
    return { value: 'ESCALATING', reason: `Activity rising (${input.recentActivity} recent vs ${input.priorActivity} prior).` };
  }
  if (input.recentActivity > 0) {
    return { value: 'ACTIVE', reason: `Recent activity (${input.recentActivity} in ${ACTIVE_WINDOW_DAYS}d).` };
  }
  return { value: 'DORMANT', reason: 'No recent relationship activity.' };
}

const LABELS: Record<SignalHealth, string> = {
  ACTIVE: 'Active', DORMANT: 'Dormant', ESCALATING: 'Escalating', RESOLVED: 'Resolved', CONTRADICTED: 'Contradicted', ARCHIVED: 'Archived', UNKNOWN: 'Unknown',
};
export function signalHealthLabel(h: SignalHealth): string { return LABELS[h]; }
