// =============================================================================
// HSI Phase 73.2 — Platform Self-Check Auditor: shared types (PURE).
//
// A deterministic, admin-only quality auditor. Every check is computed from REAL
// state (env presence, infra probes, migration audit, route/nav registries) — no
// fabricated results, no AI claims about performance. A check that cannot run is
// NOT_OBSERVED / NOT_CONFIGURED, never a fake PASS/FAIL. PURE: no I/O, no @/ values.
// =============================================================================

export const AUDIT_STATUSES = ['PASS', 'WARNING', 'FAIL', 'NOT_OBSERVED', 'NOT_CONFIGURED'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_AREAS = [
  'routing', 'rbac', 'metadata', 'supabase', 'storage', 'migrations',
  'source_network', 'signal_network', 'global_map', 'infrastructure',
  'environment', 'forms', 'conversion', 'runtime',
] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export interface AuditIssue {
  id: string;
  title: string;
  status: AuditStatus;
  severity: AuditSeverity;
  area: AuditArea;
  explanation: string;
  recommendedFix: string;
  source: string;       // which check produced this (traceability)
  timestamp: string;    // ISO (the audit run time)
}

export interface AuditSummary {
  total: number;
  byStatus: Record<AuditStatus, number>;
  bySeverity: Record<AuditSeverity, number>;
  byArea: { area: AuditArea; total: number; problems: number }[];
  readinessScore: number;        // 0–100, deterministic
  overall: 'GREEN' | 'YELLOW' | 'RED';
}

/** The full report shape — designed to also feed a future PDF export. */
export interface PlatformAuditReport {
  title: string;
  generatedAt: string;
  summary: AuditSummary;
  checks: AuditIssue[];          // ALL checks, including PASS
  issues: AuditIssue[];          // problems only (WARNING/FAIL)
  recommendations: string[];
}
