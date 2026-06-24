// =============================================================================
// HSI Phase 55.1 — Release-readiness types + PURE derivations (no I/O, no imports).
//
// Extracted from `release-readiness.ts` so the overall status/score mapping and
// the degraded fallback are unit-testable WITHOUT pulling in the cached
// intelligence layers (which import `next/cache` and cannot load under the plain
// `tsx` test runner). This module has zero runtime dependencies.
// =============================================================================

export type ReleaseStatus = 'READY' | 'MONITORING' | 'AT RISK' | 'NOT READY';
export type CheckStatus = 'Pass' | 'Warning' | 'Fail';

export interface MetricRow { label: string; value: string }
export interface HealthRow { label: string; status: CheckStatus; detail: string }
export interface ChecklistItem { label: string; status: CheckStatus; detail: string }
export interface RiskRow { label: string; severity: 'high' | 'medium'; detail: string }

export interface LaunchBrief {
  strengths: string[];
  risks: string[];
  warnings: string[];
  coverageGaps: string[];
  recommendation: string;
}

export interface ReleaseReadinessData {
  role: string | null;
  isAdmin: boolean;
  /** false when the composed intelligence data could not be loaded (page shows an empty state). */
  available: boolean;
  status: ReleaseStatus;
  score: number; // 0–100
  statusReasons: string[];
  platformReadiness: MetricRow[];
  systemHealth: HealthRow[];
  betaOps: MetricRow[];
  intelligenceHealth: MetricRow[];
  alertsRisks: RiskRow[];
  networkReadiness: { rows: MetricRow[]; score: number; scoreReason: string };
  trustGovernance: MetricRow[];
  launchBrief: LaunchBrief;
  checklist: ChecklistItem[];
}

export const STATUS_POINTS: Record<CheckStatus, number> = { Pass: 2, Warning: 1, Fail: 0 };

export interface ReleaseStatusResult { status: ReleaseStatus; score: number; statusReasons: string[] }

/**
 * PURE: derive the overall release status, 0–100 score, and human reasons from
 * the checklist. `hardFail` (critical alerts open or platform health failing)
 * forces NOT READY. An empty checklist degrades to NOT READY / score 0 — an
 * absence of data is never reported as "READY".
 */
export function deriveReleaseStatus(checklist: ChecklistItem[], hardFail: boolean): ReleaseStatusResult {
  const fails = checklist.filter((c) => c.status === 'Fail').length;
  const warns = checklist.filter((c) => c.status === 'Warning').length;
  const totalPoints = checklist.reduce((s, c) => s + STATUS_POINTS[c.status], 0);
  const score = checklist.length > 0 ? Math.round((totalPoints / (checklist.length * 2)) * 100) : 0;
  const status: ReleaseStatus =
    checklist.length === 0 ? 'NOT READY'
      : fails === 0 && warns === 0 ? 'READY'
        : fails === 0 ? 'MONITORING'
          : hardFail || fails >= 2 ? 'NOT READY' : 'AT RISK';
  const statusReasons: string[] = [];
  for (const c of checklist) if (c.status !== 'Pass') statusReasons.push(`${c.label}: ${c.status} — ${c.detail}`);
  if (statusReasons.length === 0) statusReasons.push('All readiness checks pass.');
  return { status, score, statusReasons };
}

/**
 * PURE: a safe, empty readiness used when the composed intelligence data cannot
 * be loaded (any underlying layer throwing). `available:false` tells the page to
 * render its internal empty/error state instead of crashing the whole route.
 */
export function degradedReadiness(role: string | null): ReleaseReadinessData {
  return {
    role,
    isAdmin: role === 'admin',
    available: false,
    status: 'NOT READY',
    score: 0,
    statusReasons: ['Release readiness data is temporarily unavailable.'],
    platformReadiness: [],
    systemHealth: [],
    betaOps: [],
    intelligenceHealth: [],
    alertsRisks: [],
    networkReadiness: { rows: [], score: 0, scoreReason: 'No data available' },
    trustGovernance: [],
    launchBrief: { strengths: [], risks: [], warnings: [], coverageGaps: [], recommendation: 'Release readiness data is temporarily unavailable.' },
    checklist: [],
  };
}
