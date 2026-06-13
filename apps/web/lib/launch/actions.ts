'use server';

// =============================================================================
// HSI Phase 23 — Launch Operations server actions. 'use server'. Thin wrappers
// over the admin-only DAL. Return DbResult; NEVER throw. SERVER-ONLY.
//
// The beta issue submission is a GOVERNED PLACEHOLDER (no persistence in this
// build) — it validates input and acknowledges receipt, clearly labeled as the
// BETA ISSUE SYSTEM. No automated action is taken.
// =============================================================================

import { getLaunchStatus, getMigrationAudit, type DbResult } from './persistence';
import type { LaunchStatus, IssueSeverity } from './types';

export async function getLaunchStatusAction(): Promise<DbResult<LaunchStatus>> {
  return getLaunchStatus({ now: new Date().toISOString() });
}

export async function getMigrationAuditAction() {
  return getMigrationAudit();
}

export interface SubmitIssueInput {
  title: string;
  route: string;
  role: string;
  severity: IssueSeverity;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
}

/**
 * BETA ISSUE SYSTEM (governed placeholder). Validates the report and acknowledges
 * it. Does NOT persist or trigger any automated action — beta issues are reviewed
 * by a human. Returns an acknowledgement id derived from the title length + time
 * (display only).
 */
export async function submitBetaIssueAction(
  input: SubmitIssueInput,
): Promise<DbResult<{ acknowledged: true; reference: string }>> {
  if (!input.title || input.title.trim().length === 0) {
    return { ok: false, error: 'A title is required.', code: 'DB_ERROR' };
  }
  if (!input.stepsToReproduce || input.stepsToReproduce.trim().length === 0) {
    return { ok: false, error: 'Steps to reproduce are required.', code: 'DB_ERROR' };
  }
  const reference = `BETA-${Date.now().toString(36).toUpperCase()}`;
  return { ok: true, data: { acknowledged: true, reference } };
}
