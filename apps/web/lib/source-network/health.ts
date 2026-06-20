// =============================================================================
// HSI Phase 70.3.3 — Source health classification (PURE, deterministic).
// Computes a health status from REAL signals only (status, monitoring state,
// last success/failure, recent capture events). Absent data → 'unknown',
// never a fabricated "healthy". No I/O.
// =============================================================================

import type { SourceHealth, HealthInput, ClassifiedResult } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function ageDays(iso: string | null, nowIso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(t) || Number.isNaN(now)) return null;
  return Math.max(0, (now - t) / DAY_MS);
}

const FAIL_EVENT = new Set(['failing', 'failed', 'error', 'unreachable']);
const OK_EVENT = new Set(['healthy', 'ok', 'success', 'recovered', 'warning']);

/** Classify a source's operational health. Order: terminal lifecycle states
 *  (archived/paused) → blocked → live signals (events + timestamps) → unknown. */
export function computeSourceHealth(input: HealthInput): ClassifiedResult<SourceHealth> {
  const status = (input.status ?? '').toLowerCase();
  const mon = (input.monitoringState ?? '').toUpperCase();

  // ---- terminal lifecycle states (operator-set) ----------------------------
  if (status === 'archived') return { value: 'archived', reason: 'Source is archived.' };
  if (status === 'disabled') return { value: 'archived', reason: 'Source is disabled (treated as archived).' };
  if (status === 'paused' || input.monitoringEnabled === false) {
    return { value: 'paused', reason: input.monitoringEnabled === false ? 'Monitoring disabled — paused (no auto-activation).' : 'Source is paused.' };
  }

  // ---- access blocked (paywall / login / robots / unreachable) --------------
  if (mon === 'BLOCKED') return { value: 'blocked', reason: 'Monitoring reports the source is blocked.' };
  if (mon === 'UNREACHABLE') return { value: 'offline', reason: 'Monitoring reports the source unreachable.' };

  const events = input.recentEvents.filter((e) => e.capturedAt);
  const latest = events[0];
  const successAge = ageDays(input.lastSuccessAt, input.nowIso);
  const failureAge = ageDays(input.lastFailureAt, input.nowIso);

  // ---- no observations at all ----------------------------------------------
  if (!latest && successAge == null && failureAge == null && !mon) {
    return { value: 'unknown', reason: 'No capture events or monitoring data yet.' };
  }

  // ---- failure-dominant -----------------------------------------------------
  const failingNow = latest ? FAIL_EVENT.has((latest.status ?? '').toLowerCase()) : false;
  const failureNewer = failureAge != null && (successAge == null || failureAge < successAge);
  if (failingNow || failureNewer || mon === 'FAILED') {
    // Offline if it has not succeeded recently (>14d) or never; otherwise degraded.
    if (successAge == null || successAge > 14) {
      return { value: 'offline', reason: successAge == null ? 'Failing with no recorded success.' : `Failing; last success ${Math.round(successAge)}d ago.` };
    }
    return { value: 'degraded', reason: 'Recent failure after a recent success.' };
  }

  // ---- healthy / stale ------------------------------------------------------
  if (mon === 'STALE' || (successAge != null && successAge > 14)) {
    return { value: 'degraded', reason: successAge != null ? `Stale — last success ${Math.round(successAge)}d ago.` : 'Monitoring reports stale.' };
  }
  if (mon === 'HEALTHY' || mon === 'RECOVERED') return { value: 'healthy', reason: 'Monitoring reports healthy.' };
  if (mon === 'WARNING' || mon === 'DEGRADED') return { value: 'degraded', reason: 'Monitoring reports degraded.' };
  if (latest && OK_EVENT.has((latest.status ?? '').toLowerCase())) {
    const ok = (latest.status ?? '').toLowerCase();
    if (ok === 'warning') return { value: 'degraded', reason: 'Latest capture warned.' };
    return { value: 'healthy', reason: 'Latest capture succeeded.' };
  }
  if (successAge != null && successAge <= 14) return { value: 'healthy', reason: `Last success ${Math.round(successAge)}d ago.` };

  return { value: 'unknown', reason: 'Insufficient signal to classify health.' };
}

const LABELS: Record<SourceHealth, string> = {
  healthy: 'Healthy', degraded: 'Degraded', offline: 'Offline', paused: 'Paused', archived: 'Archived', blocked: 'Blocked', unknown: 'Unknown',
};
export function healthLabel(h: SourceHealth): string { return LABELS[h]; }
