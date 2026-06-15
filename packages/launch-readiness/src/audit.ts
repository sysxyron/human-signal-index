// =============================================================================
// Readiness audit + release checklist + config audit (Deliverables 1, 17, 18).
// PURE + DETERMINISTIC.
// =============================================================================

import type {
  ChecklistItem, ChecklistResult, ConfigAudit, ConfigCheck, ConfigRequirement,
  ReadinessCheck, ReadinessReport,
} from './types';

/** Build the readiness report from evaluated checks. PURE. */
export function buildReadinessReport(checks: ReadinessCheck[]): ReadinessReport {
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const failed = total - passed;
  return { checks, passed, failed, total, score: total > 0 ? Math.round((passed / total) * 100) : 100, ready: failed === 0 };
}

/** The HSI 1.0 release checklist (Deliverable 17). */
export const RELEASE_CHECKLIST: ChecklistItem[] = [
  { key: 'typecheck', label: 'Typecheck passes (web + worker + engines)', category: 'build' },
  { key: 'build', label: 'Production build succeeds', category: 'build' },
  { key: 'tests', label: 'Full test suite green', category: 'quality' },
  { key: 'route_audit', label: 'Route audit passes', category: 'quality' },
  { key: 'migration_audit', label: 'Migration audit passes (contiguous)', category: 'data' },
  { key: 'rbac', label: 'RBAC + middleware protect every restricted route', category: 'security' },
  { key: 'integrity', label: 'No critical data-integrity issues', category: 'data' },
  { key: 'config', label: 'Required env vars + secrets present', category: 'config' },
  { key: 'monitoring', label: 'System health + worker monitoring live', category: 'ops' },
  { key: 'backups', label: 'Backup + recovery runs recorded', category: 'ops' },
  { key: 'docs', label: 'Launch documentation + certification published', category: 'docs' },
];

export function evaluateChecklist(done: Record<string, boolean>): ChecklistResult[] {
  return RELEASE_CHECKLIST.map((i) => ({ ...i, done: Boolean(done[i.key]) }));
}

/** Required configuration for production (Deliverable 18). */
export const CONFIG_REQUIREMENTS: ConfigRequirement[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', kind: 'env', required: true },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon key', kind: 'env', required: true },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Service-role key (workers)', kind: 'secret', required: true },
  { key: 'NEXT_PUBLIC_APP_URL', label: 'Public app URL', kind: 'env', required: true },
  { key: 'SENTRY_DSN', label: 'Error monitoring (Sentry)', kind: 'secret', required: false },
];

export function auditConfig(present: Record<string, boolean>): ConfigAudit {
  const checks: ConfigCheck[] = CONFIG_REQUIREMENTS.map((r) => ({ ...r, present: Boolean(present[r.key]) }));
  const missingRequired = checks.filter((c) => c.required && !c.present).map((c) => c.key);
  return { checks, missingRequired, ready: missingRequired.length === 0 };
}
