'use server';

// =============================================================================
// HSIN Phase 8 — server actions ('use server').
//
// THIN wrappers over the Phase-8 DAL (lib/operations/persistence.ts) + the
// orchestration pipeline (lib/operations/pipeline.ts). They return DbResult and
// revalidate the relevant dashboards. They NEVER throw (the DAL/pipeline already
// return DbResult).
//
// THE EXPORTED ACTION SURFACE IS LOAD-BEARING: the Phase-8 UI (operations console
// + narrative graph) is built against exactly these names — do not rename them.
//
// SERVER-ONLY: this module imports next/headers (transitively via the DAL) and
// must never be imported by a client component — it is reachable only via these
// actions.
// =============================================================================

import { revalidatePath } from 'next/cache';
import {
  buildNarrativeGraph,
  type GraphSignal,
} from '@hsi/source-intelligence';
import {
  cancelJob,
  createSchedulerRule,
  getJob,
  getNarrativeGraph,
  getOperationsOverview,
  listJobs,
  listSchedulerRules,
  listSlaPolicies,
  listTriageRules,
  operationsDbClient,
  persistNarrativeGraph,
  retryJob,
  toggleSchedulerRule,
  type CreateSchedulerRuleInput,
  type DbResult,
  type JobFilters,
  type NarrativeGraphFilters,
} from './persistence';
import {
  processSignalTriage,
  runScheduledCapture,
  type ScheduledCaptureOutcome,
} from './pipeline';
import type { TriageOutcome } from '@hsi/source-intelligence';
import type { NarrativeGraphData } from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Dashboard routes revalidated after mutations (best-effort; safe if absent).
// -----------------------------------------------------------------------------
const OPERATIONS_ROUTE = '/operations';
const JOBS_ROUTE = '/operations/jobs';
const SCHEDULER_ROUTE = '/operations/scheduler';
const GRAPH_ROUTE = '/operations/graph';
const SIGNALS_ROUTE = '/signals';

function revalidate(...paths: string[]): void {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // revalidatePath throws outside a request scope — ignore (best-effort).
    }
  }
}

// =============================================================================
// OPERATIONS CONSOLE
// =============================================================================

export async function getOperationsOverviewAction() {
  return getOperationsOverview();
}

export async function listJobsAction(filters?: JobFilters) {
  return listJobs(filters);
}

export async function getJobAction(id: string) {
  return getJob(id);
}

export async function retryJobAction(id: string) {
  const result = await retryJob(id);
  if (result.ok) revalidate(OPERATIONS_ROUTE, JOBS_ROUTE, `${JOBS_ROUTE}/${id}`);
  return result;
}

export async function cancelJobAction(id: string) {
  const result = await cancelJob(id);
  if (result.ok) revalidate(OPERATIONS_ROUTE, JOBS_ROUTE, `${JOBS_ROUTE}/${id}`);
  return result;
}

// =============================================================================
// SCHEDULER
// =============================================================================

export async function listSchedulerRulesAction() {
  return listSchedulerRules();
}

export async function createSchedulerRuleAction(
  input: CreateSchedulerRuleInput,
) {
  const result = await createSchedulerRule(input);
  if (result.ok) revalidate(SCHEDULER_ROUTE, OPERATIONS_ROUTE);
  return result;
}

export async function toggleSchedulerRuleAction(id: string, enabled: boolean) {
  const result = await toggleSchedulerRule(id, enabled);
  if (result.ok) revalidate(SCHEDULER_ROUTE, OPERATIONS_ROUTE);
  return result;
}

// =============================================================================
// NARRATIVE GRAPH
// =============================================================================

export async function getNarrativeGraphAction(filters?: NarrativeGraphFilters) {
  return getNarrativeGraph(filters);
}

/**
 * Build + persist the narrative/entity graph from recent signals (researcher+).
 *
 * 1. load recent hsin_signals (RLS-scoped — readable by any authed user);
 * 2. buildNarrativeGraph (cluster → nodes + entities → explainable edges);
 * 3. persistNarrativeGraph (upsert narratives/entities/edges/links);
 * 4. return the freshly-read NarrativeGraphData for the UI.
 *
 * NEVER throws (returns DbResult). Honesty: this is DRAFT research structure for
 * human review — nothing is published.
 */
export async function buildNarrativeGraphAction(): Promise<
  DbResult<NarrativeGraphData>
> {
  try {
    const client = operationsDbClient();

    // 1. Load recent signals (RLS-scoped). buildNarrativeGraph maps these to
    //    GraphSignal; risk weighting comes from the source risk_level.
    const { data: signalRows, error } = await client
      .from('hsin_signals')
      .select('id, title, raw_content, summary, signal_category, captured_at, source_id')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return { ok: false, error: error.message, code: 'DB_ERROR' };

    const rows = (signalRows ?? []) as Array<{
      id: string;
      title: string;
      raw_content?: string;
      summary?: string;
      signal_category?: string;
      captured_at?: string;
      source_id?: string;
    }>;

    // Source risk weighting (best-effort).
    const riskBySource = new Map<string, number>();
    {
      const sourceIds = Array.from(
        new Set(rows.map((r) => r.source_id).filter((v): v is string => !!v)),
      );
      if (sourceIds.length > 0) {
        const { data: srcRows } = await client
          .from('hsin_sources')
          .select('id, risk_level')
          .in('id', sourceIds);
        for (const s of (srcRows ?? []) as Array<{
          id: string;
          risk_level?: number;
        }>) {
          if (typeof s.risk_level === 'number') {
            riskBySource.set(s.id, s.risk_level / 5);
          }
        }
      }
    }

    const graphSignals: GraphSignal[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      bodyText: r.raw_content ?? r.summary,
      category: r.signal_category,
      capturedAt: r.captured_at,
      riskLevel: r.source_id ? riskBySource.get(r.source_id) : undefined,
    }));

    // 2. Build the graph (deterministic; never throws).
    const graph = await buildNarrativeGraph(graphSignals);

    // 3. Persist it (researcher+ — returns FORBIDDEN/AUTH_REQUIRED if not).
    const persistResult = await persistNarrativeGraph(graph);
    if (!persistResult.ok) return persistResult;

    // 4. Read back the persisted graph for the UI.
    const read = await getNarrativeGraph();
    if (read.ok) revalidate(GRAPH_ROUTE, OPERATIONS_ROUTE);
    return read;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'DB_ERROR',
    };
  }
}

// =============================================================================
// TRIAGE / SLA
// =============================================================================

export async function listTriageRulesAction() {
  return listTriageRules();
}

export async function listSlaPoliciesAction() {
  return listSlaPolicies();
}

// =============================================================================
// PIPELINE
// =============================================================================

/** Run the end-to-end scheduled capture + triage pipeline for one source. */
export async function runScheduledCaptureAction(
  sourceId: string,
): Promise<DbResult<ScheduledCaptureOutcome>> {
  const result = await runScheduledCapture(sourceId);
  if (result.ok) {
    revalidate(
      OPERATIONS_ROUTE,
      SIGNALS_ROUTE,
      GRAPH_ROUTE,
      `/signals/sources/${sourceId}`,
    );
  }
  return result;
}

/** Re-evaluate triage for an existing signal and auto-route the actions. */
export async function applyTriageToSignalAction(
  signalId: string,
): Promise<
  DbResult<{
    triage: TriageOutcome;
    alerts: number;
    reviewQueued: boolean;
    researchDraftId?: string;
  }>
> {
  const result = await processSignalTriage(signalId);
  if (result.ok) {
    revalidate(
      OPERATIONS_ROUTE,
      SIGNALS_ROUTE,
      `${SIGNALS_ROUTE}/${signalId}`,
    );
  }
  return result;
}

// =============================================================================
// RE-EXPORTS for the UI — DbResult + Phase-8 view-model / record types.
// (Type re-exports are erased at compile time; safe in a 'use server' module.)
// =============================================================================
export type { DbResult, DbResultCode } from './persistence';
export type {
  JobFilters,
  CreateSchedulerRuleInput,
  NarrativeGraphFilters,
  ProviderRateLimitInput,
} from './persistence';
export type { ScheduledCaptureOutcome } from './pipeline';
export type {
  HsinJobQueueRecord,
  HsinJobAttemptRecord,
  HsinSchedulerRuleRecord,
  HsinCaptureDedupeRecord,
  HsinEntityRecord,
  HsinSignalEntityRecord,
  HsinNarrativeRecord,
  HsinSignalNarrativeRecord,
  HsinNarrativeEdgeRecord,
  HsinTriageRuleRecord,
  HsinSlaPolicyRecord,
  HsinProviderAccountRecord,
  HsinProviderRateLimitRecord,
  OperationsOverview,
  NarrativeGraphData,
  JobWithAttempts,
  JobStatus,
  HsinEntityType,
  NarrativeEdgeType,
  TriageActionType,
  SlaSeverity,
} from '@hsi/shared-types';
export type { TriageOutcome, TriageContext } from '@hsi/source-intelligence';
