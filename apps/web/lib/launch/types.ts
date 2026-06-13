// =============================================================================
// Launch operations — shared view types (Phase 23). CLIENT-SAFE (pure types).
// =============================================================================

import type { ReadinessReport } from './readiness';
import type { MigrationAuditResult } from './migration-audit';

export interface LaunchEnvStatus {
  requiredMissing: string[];
  optionalMissing: string[];
  masked: Record<string, string>;
}

export interface LaunchHealthLine {
  service: string;
  ok: boolean;
  status: string;
  message: string;
}

/** The full Launch Operations Center payload. */
export interface LaunchStatus {
  readiness: ReadinessReport;
  migration: MigrationAuditResult;
  env: LaunchEnvStatus;
  health: LaunchHealthLine[];
  rbac: { resolvedRole: string | null; source: string };
  testerCount: number | null;
  appUrl: string | null;
  generatedAt: string;
}

/** A beta issue (governed placeholder — not persisted in this build). */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'wont_fix';

export interface BetaIssue {
  id: string;
  title: string;
  route: string;
  role: string;
  severity: IssueSeverity;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  status: IssueStatus;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}
