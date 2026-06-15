// =============================================================================
// @hsi/launch-readiness — types. PURE (no DB, no UI, no Date.now()).
//
// The HSI 1.0 hardening layer: it aggregates readiness checks, worker/queue/
// service HEALTH, data-integrity findings, KPIs, config audit, and audit export.
// It is OBSERVABILITY only — it never changes RBAC, auth, or any business state.
// =============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';
export type Severity = 'info' | 'warning' | 'critical';

export interface ReadinessCheck {
  key: string;
  label: string;
  category: 'rbac' | 'cms' | 'investigations' | 'publishing' | 'trust' | 'lineage' | 'beta' | 'monitoring' | 'config' | 'data';
  passed: boolean;
  detail?: string;
}
export interface ReadinessReport {
  checks: ReadinessCheck[];
  passed: number;
  failed: number;
  total: number;
  score: number; // 0..100
  ready: boolean; // no failures
}

export interface WorkerHealthInput {
  name: string;
  lastRunAt: string | null;
  expectedIntervalMs: number;
  recentFailures: number;
}
export interface WorkerHealth {
  name: string;
  status: HealthStatus;
  ageMs: number | null;
  recentFailures: number;
}

export interface QueueCounts { pending: number; running: number; failed: number; completed: number }
export interface QueueHealth { status: HealthStatus; failureRate: number; backlog: number }

export interface IntegrityCounts {
  orphans: number;
  brokenLineage: number;
  invalidAttribution: number;
  invalidTrustLinks: number;
}
export interface IntegrityIssue { kind: string; count: number; severity: Severity }
export interface IntegrityReport { issues: IntegrityIssue[]; totalIssues: number; clean: boolean }

export interface KpiInput {
  signalsSubmitted: number;
  signalsAccepted: number;
  reviewsAgreed: number;
  reviewsTotal: number;
  governanceConfirmed: number;
  governanceTotal: number;
  publicationsPublished: number;
  publicationWindowDays: number;
}
export interface KpiSet {
  acceptanceRate: number; // 0..100
  reviewAccuracy: number; // 0..100
  governanceEffectiveness: number; // 0..100
  publicationThroughputPerWeek: number;
}

export interface ConfigRequirement { key: string; label: string; kind: 'env' | 'secret' | 'flag'; required: boolean }
export interface ConfigCheck extends ConfigRequirement { present: boolean }
export interface ConfigAudit { checks: ConfigCheck[]; missingRequired: string[]; ready: boolean }

export interface ChecklistItem { key: string; label: string; category: string }
export interface ChecklistResult extends ChecklistItem { done: boolean }
