'use server';

// =============================================================================
// HSIN Phase 18 — Research Orchestration & Operations Center server actions.
// 'use server'.
//
// THIN wrappers over the Phase-18 DAL (lib/orchestration/persistence.ts). They
// return DbResult and revalidate the operations dashboards. They NEVER throw.
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-18 UI is built against
// exactly these names. SERVER-ONLY (imports next/headers via the DAL).
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  createResearchRun,
  decideOpportunity,
  getEscalations,
  getOperationsDashboard,
  getOperationsHighlights,
  getOpportunities,
  getPlatformHealth,
  getResearchRunReplay,
  getResearchRuns,
  resolveEscalation,
  seedWorkflowTemplates,
  transitionRun,
  type AdvanceRunResult,
  type CreateRunResult,
  type DbResult,
} from './persistence';
import type {
  EscalationsData,
  OperationsDashboardData,
  OperationsHighlights,
  OpportunitiesData,
  PlatformHealthData,
  ResearchPriority,
  ResearchRunReplayData,
  ResearchRunState,
  ResearchRunsData,
} from '@hsi/shared-types';

const OPERATIONS_ROUTE = '/dashboard/intelligence/operations';
const RUNS_ROUTE = '/dashboard/intelligence/runs';
const HEALTH_ROUTE = '/dashboard/intelligence/health';
const OPPS_ROUTE = '/dashboard/intelligence/opportunities';
const ESC_ROUTE = '/dashboard/intelligence/escalations';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // best-effort outside a request scope.
    }
  }
}

// ---- READS ------------------------------------------------------------------

export async function getOperationsDashboardAction(): Promise<DbResult<OperationsDashboardData>> {
  return getOperationsDashboard();
}
export async function getResearchRunsAction(state?: ResearchRunState): Promise<DbResult<ResearchRunsData>> {
  return getResearchRuns(state);
}
export async function getResearchRunReplayAction(id: string): Promise<DbResult<ResearchRunReplayData>> {
  return getResearchRunReplay(id);
}
export async function getPlatformHealthAction(): Promise<DbResult<PlatformHealthData>> {
  return getPlatformHealth();
}
export async function getOpportunitiesAction(status?: string): Promise<DbResult<OpportunitiesData>> {
  return getOpportunities(status);
}
export async function getEscalationsAction(status?: string): Promise<DbResult<EscalationsData>> {
  return getEscalations(status);
}
export async function getOperationsHighlightsAction(): Promise<DbResult<OperationsHighlights>> {
  return getOperationsHighlights();
}

// ---- WRITES -----------------------------------------------------------------

/** Create a research run (curator/admin). Enqueues it; never auto-advances. */
export async function createResearchRunAction(input: {
  title?: string;
  priority?: ResearchPriority;
  workflowKey?: string;
}): Promise<DbResult<CreateRunResult>> {
  const result = await createResearchRun(input, new Date().toISOString());
  if (result.ok) revalidate(OPERATIONS_ROUTE, RUNS_ROUTE);
  return result;
}

/** Advance/transition a run through the state machine (curator/admin). */
export async function transitionRunAction(
  id: string,
  to: ResearchRunState | 'ADVANCE',
  reason?: string,
): Promise<DbResult<AdvanceRunResult>> {
  const result = await transitionRun(id, to, new Date().toISOString(), reason);
  if (result.ok) revalidate(OPERATIONS_ROUTE, RUNS_ROUTE, `${RUNS_ROUTE}/${id}`);
  return result;
}

/** Accept/reject a proposed opportunity (curator/admin). Accept spawns a run. */
export async function decideOpportunityAction(
  id: string,
  decision: 'accepted' | 'rejected',
  reason?: string,
): Promise<DbResult<{ opportunityId: string; status: string; runId?: string }>> {
  const result = await decideOpportunity(id, decision, new Date().toISOString(), reason);
  if (result.ok) revalidate(OPPS_ROUTE, OPERATIONS_ROUTE, RUNS_ROUTE);
  return result;
}

/** Acknowledge/resolve an escalation (curator/admin; resolution required to resolve). */
export async function resolveEscalationAction(
  id: string,
  status: 'acknowledged' | 'resolved',
  resolution: string,
): Promise<DbResult<{ escalationId: string; status: string }>> {
  const result = await resolveEscalation(id, status, resolution, new Date().toISOString());
  if (result.ok) revalidate(ESC_ROUTE, OPERATIONS_ROUTE);
  return result;
}

/** Seed the seven workflow templates (curator/admin). */
export async function seedWorkflowTemplatesAction(): Promise<DbResult<{ seeded: number }>> {
  const result = await seedWorkflowTemplates(new Date().toISOString());
  if (result.ok) revalidate(OPERATIONS_ROUTE);
  return result;
}

// ---- RE-EXPORTS -------------------------------------------------------------
export type { DbResult, DbResultCode } from './persistence';
export type { CreateRunResult, AdvanceRunResult } from './persistence';
export type {
  HsinResearchRunRecord,
  HsinResearchRunEventRecord,
  HsinResearchTaskRecord,
  HsinResearchQueueRecord,
  HsinResearchOpportunityRecord,
  HsinResearchEscalationRecord,
  HsinAgentAssignmentRecord,
  HsinWorkflowTemplateRecord,
  OperationsDashboardData,
  ResearchRunsData,
  ResearchRunReplayData,
  PlatformHealthData,
  OpportunitiesData,
  EscalationsData,
  OperationsHighlights,
  EngineHealthView,
  AgentPerformanceView,
  ResearchRunState,
  ResearchPriority,
  ResearchAgentType,
  EngineName,
  EngineHealthStatus,
  EscalationSeverity,
  EscalationTrigger,
} from '@hsi/shared-types';
