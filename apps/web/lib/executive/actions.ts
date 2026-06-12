'use server';

// =============================================================================
// HSIN Phase 22 — Executive Command Center server actions. 'use server'. THIN
// wrappers over the Phase-22 DAL. Return DbResult; revalidate the dashboards;
// NEVER throw. SERVER-ONLY.
//
// GOVERNANCE: autoPublish/autoApprove/autoAct/autoGovern = false. Queue + decide
// always require a HUMAN reviewer + reason; every decision is reversible.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  decideExecutiveReviewDal,
  getExecutiveBriefings,
  getExecutiveCommand,
  getExecutiveGovernance,
  getExecutiveHighlights,
  getExecutiveOpportunities,
  getExecutivePriorities,
  getExecutiveRisks,
  persistGovernanceBriefDal,
  queueExecutiveReviewDal,
  type DbResult,
} from './persistence';
import type {
  ExecutiveBriefingsData,
  ExecutiveCommandData,
  ExecutiveGovernanceData,
  ExecutiveHighlights,
  ExecutiveOpportunitiesData,
  ExecutivePrioritiesData,
  ExecutiveRisksData,
} from '@hsi/shared-types';

const EXEC = '/dashboard/executive';
const PRIORITIES = '/dashboard/priorities';
const RISKS = '/dashboard/risks';
const OPPORTUNITIES = '/dashboard/opportunities';
const BRIEFINGS = '/dashboard/briefings';
const GOVERNANCE = '/dashboard/exec-governance';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // best-effort.
    }
  }
}

// ---- reads ------------------------------------------------------------------
export async function getExecutiveCommandAction(): Promise<DbResult<ExecutiveCommandData>> {
  return getExecutiveCommand({ now: new Date().toISOString() });
}
export async function getExecutivePrioritiesAction(): Promise<DbResult<ExecutivePrioritiesData>> {
  return getExecutivePriorities({ now: new Date().toISOString() });
}
export async function getExecutiveRisksAction(): Promise<DbResult<ExecutiveRisksData>> {
  return getExecutiveRisks({ now: new Date().toISOString() });
}
export async function getExecutiveOpportunitiesAction(): Promise<DbResult<ExecutiveOpportunitiesData>> {
  return getExecutiveOpportunities({ now: new Date().toISOString() });
}
export async function getExecutiveBriefingsAction(): Promise<DbResult<ExecutiveBriefingsData>> {
  return getExecutiveBriefings({ now: new Date().toISOString() });
}
export async function getExecutiveGovernanceAction(): Promise<DbResult<ExecutiveGovernanceData>> {
  return getExecutiveGovernance();
}
export async function getExecutiveHighlightsAction(): Promise<DbResult<ExecutiveHighlights>> {
  return getExecutiveHighlights({ now: new Date().toISOString() });
}

// ---- writes (governance — human reviewer + reason required) -----------------
export async function queueExecutiveReviewAction(priorityId: string): Promise<DbResult<{ reviewId: string }>> {
  const result = await queueExecutiveReviewDal(priorityId, new Date().toISOString());
  if (result.ok) revalidate(GOVERNANCE, PRIORITIES, EXEC);
  return result;
}

export async function decideExecutiveReviewAction(reviewId: string, decision: 'approved' | 'rejected' | 'archived', reviewer: string, reason: string): Promise<DbResult<{ id: string; decision: string }>> {
  const result = await decideExecutiveReviewDal(reviewId, decision, { reviewer, reason }, new Date().toISOString());
  if (result.ok) revalidate(GOVERNANCE, EXEC);
  return result;
}

export async function persistGovernanceBriefAction(): Promise<DbResult<{ briefId: string }>> {
  const result = await persistGovernanceBriefDal(new Date().toISOString());
  if (result.ok) revalidate(BRIEFINGS);
  return result;
}

// ---- re-exports -------------------------------------------------------------
export type { DbResult, DbResultCode } from './persistence';
export type {
  ExecutiveCommandData,
  ExecutivePrioritiesData,
  ExecutiveRisksData,
  ExecutiveOpportunitiesData,
  ExecutiveBriefingsData,
  ExecutiveGovernanceData,
  ExecutiveHighlights,
  ExecutiveAttentionLevel,
  ExecutivePriorityKind,
  ExecutiveSeverityLevel,
  ExecutiveBriefKind,
  HsinExecutiveSnapshotRecord,
  HsinExecutivePriorityRecord,
  HsinExecutiveBriefRecord,
  HsinExecutiveReviewRecord,
  HsinExecutiveReportRecord,
  HsinExecutiveDecisionRecord,
} from '@hsi/shared-types';
