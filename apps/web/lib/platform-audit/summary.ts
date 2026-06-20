// =============================================================================
// HSI Phase 73.2 — Audit summarization (PURE, deterministic). Counts, ordering,
// readiness score, overall status. Score reflects only assessable checks
// (NOT_OBSERVED / NOT_CONFIGURED do not penalize). No fabrication. No I/O.
// =============================================================================

import type { AuditIssue, AuditStatus, AuditSeverity, AuditArea, AuditSummary } from './types';

const STATUS_RANK: Record<AuditStatus, number> = { FAIL: 0, WARNING: 1, NOT_CONFIGURED: 2, NOT_OBSERVED: 3, PASS: 4 };
const SEVERITY_RANK: Record<AuditSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Worst-first: FAIL before WARNING …; within a status, higher severity first. */
export function sortIssues(issues: AuditIssue[]): AuditIssue[] {
  return [...issues].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.title.localeCompare(b.title));
}

const PENALTY: Record<AuditSeverity, number> = { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 };

/** 100 minus penalties for FAIL (full) and WARNING (half). NOT_OBSERVED /
 *  NOT_CONFIGURED never penalize (can't assess). Clamped 0–100. */
export function readinessScore(issues: AuditIssue[]): number {
  let score = 100;
  for (const i of issues) {
    if (i.status === 'FAIL') score -= PENALTY[i.severity];
    else if (i.status === 'WARNING') score -= Math.round(PENALTY[i.severity] / 2);
  }
  return Math.max(0, Math.min(100, score));
}

export function isProblem(s: AuditStatus): boolean { return s === 'FAIL' || s === 'WARNING'; }

export function summarizeAudit(issues: AuditIssue[]): AuditSummary {
  const byStatus = { PASS: 0, WARNING: 0, FAIL: 0, NOT_OBSERVED: 0, NOT_CONFIGURED: 0 } as Record<AuditStatus, number>;
  const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<AuditSeverity, number>;
  const areaMap = new Map<AuditArea, { total: number; problems: number }>();
  for (const i of issues) {
    byStatus[i.status]++;
    if (isProblem(i.status)) bySeverity[i.severity]++;
    const a = areaMap.get(i.area) ?? { total: 0, problems: 0 };
    a.total++; if (isProblem(i.status)) a.problems++;
    areaMap.set(i.area, a);
  }
  const score = readinessScore(issues);
  // Overall: RED if any FAIL, else YELLOW if any WARNING, else GREEN.
  const overall: AuditSummary['overall'] = byStatus.FAIL > 0 ? 'RED' : byStatus.WARNING > 0 ? 'YELLOW' : 'GREEN';
  return {
    total: issues.length, byStatus, bySeverity,
    byArea: Array.from(areaMap.entries()).map(([area, v]) => ({ area, total: v.total, problems: v.problems })).sort((x, y) => y.problems - x.problems || y.total - x.total),
    readinessScore: score, overall,
  };
}

/** Top recommended next actions = recommended fixes of the worst open issues. */
export function recommendations(issues: AuditIssue[], limit = 6): string[] {
  return sortIssues(issues.filter((i) => isProblem(i.status))).slice(0, limit).map((i) => `${i.title}: ${i.recommendedFix}`);
}
