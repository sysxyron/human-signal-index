// =============================================================================
// HSIN Phase 18 — Research Orchestration & Operations Center data-access layer.
// SERVER-ONLY.
//
// "What research is running, what failed, what needs attention, and can I replay
// the whole intelligence process?" The persistence layer for the Phase-18
// orchestration tables (migration 0022):
//
//   * RUNS         — hsin_research_runs + hsin_research_run_events (append-only
//                    audited transitions) + hsin_research_tasks + hsin_agent_assignments.
//   * QUEUE        — hsin_research_queue (durable priority queue).
//   * OPPORTUNITIES— hsin_research_opportunities (proposed; human-accepted).
//   * ESCALATIONS  — hsin_research_escalations (open; human-resolved).
//   * TEMPLATES    — hsin_workflow_templates.
//
// The PURE engines live in '@hsi/research-orchestrator' (state machine, agents,
// discovery, escalation, templates, health) and '@hsi/intelligence-queue' (queue).
// This DAL reads the persisted state, feeds it (with an injected `now`) into the
// engines, and persists governance decisions / transitions. Reads assemble the
// Phase-18 view-models the operations dashboards render.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). Mirrors lib/trust/persistence.ts.
//
// AUTHZ (migration 0022 RLS): researcher+ READ; curator/admin WRITE; admin all.
// GOVERNANCE: opportunities/escalations/overrides are human-approved, auditable,
// reversible. The orchestrator never auto-publishes or auto-acts. NEVER throws;
// empty env → NOT_CONFIGURED.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  advanceResearchRun,
  agentHealth,
  createResearchRun as engineCreateRun,
  escalateResearchIssue,
  orchestratorDemo,
  pipelineProgress,
  platformHealth,
  transitionResearchRun,
  WORKFLOW_TEMPLATES,
  type AgentTask,
  type EngineHealthInput,
  type ResearchRun,
  type ResearchRunState as EngineRunState,
} from '@hsi/research-orchestrator';
import { enqueueResearch } from '@hsi/intelligence-queue';
import type {
  AgentPerformanceView,
  AppRole,
  EngineHealthView,
  EngineHealthStatus,
  EscalationSeverity,
  EscalationsData,
  HsinAgentAssignmentRecord,
  HsinResearchEscalationRecord,
  HsinResearchOpportunityRecord,
  HsinResearchQueueRecord,
  HsinResearchRunEventRecord,
  HsinResearchRunRecord,
  HsinResearchTaskRecord,
  OperationsDashboardData,
  OperationsHighlights,
  OpportunitiesData,
  PlatformHealthData,
  ResearchAgentType,
  ResearchPriority,
  ResearchRunReplayData,
  ResearchRunsData,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN'.
// -----------------------------------------------------------------------------
export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const AUTH_REQUIRED = 'Sign in to continue.';

export function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('orchestration/persistence', error);
  if (
    error instanceof Error &&
    /required|not configured|SUPABASE_/i.test(error.message) &&
    /key|url/i.test(error.message)
  ) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}
function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}
export function forbidden(required: AppRole): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: `Requires the ${required} role or higher.`, code: 'FORBIDDEN' };
}
function validation(message: string): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: message, code: 'FORBIDDEN' };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers.
// -----------------------------------------------------------------------------
function db(): SupabaseClient {
  return createClient();
}
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const { data: { user } } = await client.auth.getUser();
  return user ?? null;
}
const ROLE_LEVEL: Record<AppRole, number> = { viewer: 1, researcher: 2, reviewer: 3, curator: 4, admin: 5 };
async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client.from('users').select('role').eq('id', user.id).single();
  const role = (data?.role as string | undefined) ?? 'viewer';
  return (role in ROLE_LEVEL ? role : 'viewer') as AppRole;
}
async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<
  { ok: true; user: User; role: AppRole } | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

type JsonRecord = Record<string, unknown>;
function listJson(items: string[]): JsonRecord {
  return { items };
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

const ACTIVE_STATES: EngineRunState[] = [
  'QUEUED', 'DISCOVERING', 'COLLECTING', 'ANALYZING', 'REASONING', 'EVIDENCING',
  'TEMPORAL', 'CAUSAL', 'COUNTERFACTUAL', 'DECISION', 'OUTCOME', 'CALIBRATION',
  'TRUST', 'GOVERNANCE',
];

// =============================================================================
// READS (researcher+)
// =============================================================================

/** The operations center dashboard (all widgets). RLS: researcher+. NEVER throws. */
export async function getOperationsDashboard(): Promise<DbResult<OperationsDashboardData>> {
  try {
    const client = db();
    const now = new Date().toISOString();

    const { data: runRows, error: rerr } = await client
      .from('hsin_research_runs').select('*').order('created_at', { ascending: false }).limit(2000);
    if (rerr) return fail(rerr);
    const runs = (runRows ?? []) as HsinResearchRunRecord[];

    const { data: queueRows } = await client
      .from('hsin_research_queue').select('*').limit(2000);
    const queue = (queueRows ?? []) as HsinResearchQueueRecord[];

    const { data: oppRows } = await client
      .from('hsin_research_opportunities').select('*').eq('status', 'proposed')
      .order('confidence', { ascending: false }).limit(200);
    const opportunities = (oppRows ?? []) as HsinResearchOpportunityRecord[];

    const { data: escRows } = await client
      .from('hsin_research_escalations').select('*').eq('status', 'open')
      .order('created_at', { ascending: false }).limit(200);
    const escalations = (escRows ?? []) as HsinResearchEscalationRecord[];

    const { data: taskRows } = await client
      .from('hsin_research_tasks').select('*').limit(5000);
    const tasks = (taskRows ?? []) as HsinResearchTaskRecord[];

    const runsByState = countBy(runs, (r) => r.state ?? 'CREATED');
    const activeRuns = runs.filter((r) => ACTIVE_STATES.includes((r.state ?? '') as EngineRunState));
    const recentFailures = runs.filter((r) => r.state === 'FAILED' || r.state === 'ESCALATED').slice(0, 10);
    const governanceBacklog = runsByState['GOVERNANCE'] ?? 0;
    const health = computeHealth(runs, tasks, queue, escalations, now);
    const agentPerformance = computeAgentPerformance(tasks);
    const trustScores = runs.map((r) => r.trust_score).filter((x): x is number => typeof x === 'number');
    const avgTrust = trustScores.length
      ? Math.round((trustScores.reduce((a, n) => a + n, 0) / trustScores.length) * 100) / 100
      : undefined;

    return {
      ok: true,
      data: {
        runsByState,
        activeRuns: activeRuns.slice(0, 50),
        queue: queue.slice(0, 100),
        queueDepth: queueStatsDepth(queue),
        opportunities,
        escalations,
        health,
        overallStatus: worstStatus(health),
        agentPerformance,
        recentFailures,
        governanceBacklog,
        ...(avgTrust !== undefined ? { avgTrust } : {}),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** The runs list (optionally filtered by state). RLS: researcher+. NEVER throws. */
export async function getResearchRuns(state?: string): Promise<DbResult<ResearchRunsData>> {
  try {
    const client = db();
    let query = client.from('hsin_research_runs').select('*').order('created_at', { ascending: false }).limit(2000);
    if (state) query = query.eq('state', state);
    const { data, error } = await query;
    if (error) return fail(error);
    const runs = (data ?? []) as HsinResearchRunRecord[];

    const { data: allRows } = await client.from('hsin_research_runs').select('state').limit(5000);
    const byState = countBy((allRows ?? []) as Array<{ state?: string }>, (r) => r.state ?? 'CREATED');
    return { ok: true, data: { runs, byState } };
  } catch (e) {
    return fail(e);
  }
}

/** A single run replay: run + event timeline + tasks + assignments + escalations. RLS: researcher+. */
export async function getResearchRunReplay(id: string): Promise<DbResult<ResearchRunReplayData>> {
  try {
    const client = db();
    const { data: row, error } = await client.from('hsin_research_runs').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Research run not found.', code: 'DB_ERROR' };
    const run = row as HsinResearchRunRecord;

    const { data: evRows } = await client
      .from('hsin_research_run_events').select('*').eq('run_id', id)
      .order('at', { ascending: true, nullsFirst: true }).order('created_at', { ascending: true }).limit(1000);
    const events = (evRows ?? []) as HsinResearchRunEventRecord[];

    const { data: taskRows } = await client
      .from('hsin_research_tasks').select('*').eq('run_id', id).order('created_at', { ascending: true }).limit(1000);
    const tasks = (taskRows ?? []) as HsinResearchTaskRecord[];

    const { data: asgRows } = await client
      .from('hsin_agent_assignments').select('*').eq('run_id', id).order('created_at', { ascending: true }).limit(1000);
    const assignments = (asgRows ?? []) as HsinAgentAssignmentRecord[];

    const { data: escRows } = await client
      .from('hsin_research_escalations').select('*').eq('run_id', id).order('created_at', { ascending: false }).limit(200);
    const escalations = (escRows ?? []) as HsinResearchEscalationRecord[];

    const { data: qRows } = await client
      .from('hsin_research_queue').select('*').eq('run_id', id).limit(1);
    const queue = ((qRows ?? []) as HsinResearchQueueRecord[])[0];

    const progress = pipelineProgress((run.state ?? 'CREATED') as EngineRunState);
    return { ok: true, data: { run, events, tasks, assignments, escalations, ...(queue ? { queue } : {}), progress } };
  } catch (e) {
    return fail(e);
  }
}

/** Platform health. RLS: researcher+. NEVER throws. */
export async function getPlatformHealth(): Promise<DbResult<PlatformHealthData>> {
  try {
    const client = db();
    const now = new Date().toISOString();
    const { data: runRows } = await client.from('hsin_research_runs').select('*').limit(5000);
    const { data: taskRows } = await client.from('hsin_research_tasks').select('*').limit(5000);
    const { data: queueRows } = await client.from('hsin_research_queue').select('*').limit(5000);
    const { data: escRows } = await client.from('hsin_research_escalations').select('*').eq('status', 'open').limit(2000);
    const runs = (runRows ?? []) as HsinResearchRunRecord[];
    const tasks = (taskRows ?? []) as HsinResearchTaskRecord[];
    const queue = (queueRows ?? []) as HsinResearchQueueRecord[];
    const escalations = (escRows ?? []) as HsinResearchEscalationRecord[];
    const health = computeHealth(runs, tasks, queue, escalations, now);
    return {
      ok: true,
      data: { health, overallStatus: worstStatus(health), agentPerformance: computeAgentPerformance(tasks) },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Opportunities (optionally filtered by status). RLS: researcher+. NEVER throws. */
export async function getOpportunities(status?: string): Promise<DbResult<OpportunitiesData>> {
  try {
    const client = db();
    let query = client.from('hsin_research_opportunities').select('*').order('confidence', { ascending: false }).limit(1000);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return fail(error);
    const opportunities = (data ?? []) as HsinResearchOpportunityRecord[];
    const { data: allRows } = await client.from('hsin_research_opportunities').select('status').limit(5000);
    const counts = { proposed: 0, accepted: 0, rejected: 0 };
    for (const r of (allRows ?? []) as Array<{ status?: string }>) {
      if (r.status && r.status in counts) counts[r.status as keyof typeof counts] += 1;
    }
    return { ok: true, data: { opportunities, proposedCount: counts.proposed, acceptedCount: counts.accepted, rejectedCount: counts.rejected } };
  } catch (e) {
    return fail(e);
  }
}

/** Escalations (optionally filtered by status). RLS: researcher+. NEVER throws. */
export async function getEscalations(status?: string): Promise<DbResult<EscalationsData>> {
  try {
    const client = db();
    let query = client.from('hsin_research_escalations').select('*').order('created_at', { ascending: false }).limit(1000);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) return fail(error);
    const escalations = (data ?? []) as HsinResearchEscalationRecord[];
    const bySeverity: Record<EscalationSeverity, number> = { INFO: 0, WARNING: 0, HIGH: 0, CRITICAL: 0 };
    let openCount = 0;
    for (const e of escalations) {
      if (e.severity && e.severity in bySeverity) bySeverity[e.severity] += 1;
      if (e.status === 'open') openCount += 1;
    }
    return { ok: true, data: { escalations, bySeverity, openCount } };
  } catch (e) {
    return fail(e);
  }
}

/** Headline operations callouts. RLS: researcher+. NEVER throws. */
export async function getOperationsHighlights(): Promise<DbResult<OperationsHighlights>> {
  try {
    const client = db();
    const highlights: OperationsHighlights = {};
    const { data: runRows } = await client.from('hsin_research_runs').select('state').limit(5000);
    const runs = (runRows ?? []) as Array<{ state?: string }>;
    highlights.activeRuns = runs.filter((r) => ACTIVE_STATES.includes((r.state ?? '') as EngineRunState)).length;
    const { data: qRows } = await client.from('hsin_research_queue').select('status').in('status', ['queued', 'retrying', 'active']).limit(5000);
    highlights.queueDepth = (qRows ?? []).length;
    const { data: escRows } = await client.from('hsin_research_escalations').select('id').eq('status', 'open').limit(5000);
    highlights.openEscalations = (escRows ?? []).length;
    const { data: oppRows } = await client.from('hsin_research_opportunities').select('id').eq('status', 'proposed').limit(5000);
    highlights.proposedOpportunities = (oppRows ?? []).length;
    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// Health + agent + count helpers (pure)
// =============================================================================

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function queueStatsDepth(queue: HsinResearchQueueRecord[]): number {
  return queue.filter((q) => q.status === 'queued' || q.status === 'retrying' || q.status === 'active').length;
}

/** Map a research-agent type to a monitored engine name (calibration ← trust agent). */
const AGENT_ENGINE: Record<ResearchAgentType, EngineHealthInput['engine']> = {
  research: 'research',
  evidence: 'evidence',
  temporal: 'temporal',
  causal: 'causal',
  counterfactual: 'counterfactual',
  decision: 'decision',
  outcome: 'outcome',
  trust: 'trust',
};

/** Compute platform health from runs / tasks / queue / escalations. Explainable. */
function computeHealth(
  runs: HsinResearchRunRecord[],
  tasks: HsinResearchTaskRecord[],
  queue: HsinResearchQueueRecord[],
  escalations: HsinResearchEscalationRecord[],
  now: string,
): EngineHealthView[] {
  const inputs: EngineHealthInput[] = [];

  // research engine ← all runs (failed/escalated count as failures) + queue depth.
  const runFailures = runs.filter((r) => r.state === 'FAILED' || r.state === 'ESCALATED').length;
  inputs.push({
    engine: 'research',
    runs: runs.length,
    failures: runFailures,
    queueDepth: queueStatsDepth(queue),
    lastRun: runs[0]?.created_at ?? now,
  });

  // per-agent engines ← their tasks.
  const byAgent = new Map<ResearchAgentType, HsinResearchTaskRecord[]>();
  for (const t of tasks) {
    if (!t.agent_type) continue;
    const arr = byAgent.get(t.agent_type) ?? [];
    arr.push(t);
    byAgent.set(t.agent_type, arr);
  }
  for (const [agent, ts] of byAgent) {
    const engine = AGENT_ENGINE[agent];
    if (engine === 'research') continue; // already covered at run level.
    const completed = ts.filter((t) => t.state === 'completed').length;
    const failed = ts.filter((t) => t.state === 'failed' || t.state === 'blocked').length;
    const pending = ts.filter((t) => t.state === 'pending' || t.state === 'active').length;
    inputs.push({ engine, runs: completed + failed, failures: failed, queueDepth: pending });
  }

  // calibration engine ← trust tasks (shared agent) as a proxy.
  const trustTasks = byAgent.get('trust') ?? [];
  const calCompleted = trustTasks.filter((t) => t.state === 'completed').length;
  const calFailed = trustTasks.filter((t) => t.state === 'failed' || t.state === 'blocked').length;
  inputs.push({ engine: 'calibration', runs: calCompleted + calFailed, failures: calFailed });

  // governance engine ← GOVERNANCE-state runs + governance_backlog escalations.
  const govBacklog = runs.filter((r) => r.state === 'GOVERNANCE').length;
  const govEsc = escalations.filter((e) => e.trigger === 'governance_backlog').length;
  inputs.push({ engine: 'governance', runs: govBacklog + govEsc, failures: govEsc, queueDepth: govBacklog });

  return platformHealth(inputs).map(toHealthView);
}

function toHealthView(h: ReturnType<typeof platformHealth>[number]): EngineHealthView {
  return {
    engine: h.engine,
    status: h.status,
    ...(h.lastRun ? { lastRun: h.lastRun } : {}),
    successRate: h.successRate,
    failureRate: h.failureRate,
    queueDepth: h.queueDepth,
    detail: h.detail,
  };
}

function worstStatus(health: EngineHealthView[]): EngineHealthStatus {
  if (health.some((h) => h.status === 'DOWN')) return 'DOWN';
  if (health.some((h) => h.status === 'DEGRADED')) return 'DEGRADED';
  return 'HEALTHY';
}

function computeAgentPerformance(tasks: HsinResearchTaskRecord[]): AgentPerformanceView[] {
  const engineTasks: AgentTask[] = tasks.map((t) => ({
    id: t.id,
    runId: t.run_id ?? '',
    agentType: (t.agent_type ?? 'research') as AgentTask['agentType'],
    stage: (t.stage ?? 'ANALYZING') as AgentTask['stage'],
    state: (t.state ?? 'pending') as AgentTask['state'],
    attempts: num(t.attempts),
    maxAttempts: num(t.max_attempts, 3),
    runtimeMs: num(t.runtime_ms),
    createdAt: t.created_at,
    updatedAt: t.updated_at ?? t.created_at,
  }));
  return agentHealth(engineTasks).map((h) => ({
    agentType: h.agentType,
    status: h.status,
    active: h.active,
    completed: h.completed,
    failed: h.failed,
    blocked: h.blocked,
    avgRuntimeMs: h.avgRuntimeMs,
    successRate: h.successRate,
  }));
}

// =============================================================================
// WRITES (curator/admin). NEVER throw.
// =============================================================================

export interface CreateRunResult { runId: string }

/**
 * Create a research run (curator/admin): insert the run (CREATED) + the genesis
 * event + a queue item. Optionally link a workflow template / opportunity. The
 * engine state machine sets the initial state; nothing auto-advances. NEVER throws.
 */
export async function createResearchRun(
  input: { title?: string; priority?: ResearchPriority; workflowKey?: string; opportunityId?: string },
  now: string,
): Promise<DbResult<CreateRunResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const run = engineCreateRun(
      { id: 'pending', priority: input.priority ?? 'NORMAL', workflow: input.workflowKey, title: input.title },
      { now, actor: gate.user.id },
    );

    const { data: row, error } = await client
      .from('hsin_research_runs')
      .insert({
        title: input.title ?? null,
        state: run.state,
        priority: run.priority,
        workflow_key: input.workflowKey ?? null,
        opportunity_id: input.opportunityId ?? null,
        created_by: gate.user.id,
      })
      .select('id')
      .single();
    if (error || !row?.id) return fail(error ?? new Error('Run insert returned no id.'));
    const runId = row.id as string;

    // Genesis event.
    await client.from('hsin_research_run_events').insert({
      run_id: runId, from_state: 'CREATED', to_state: 'CREATED', actor: gate.user.id, reason: 'Run created.', at: now,
    });
    // Enqueue (durable queue).
    const enq = enqueueResearch([], { id: runId, runId, priority: run.priority, payload: input.workflowKey ? { workflow: input.workflowKey } : undefined }, { now });
    if (enq.ok) {
      const item = enq.data.item;
      await client.from('hsin_research_queue').insert({
        run_id: runId, priority: item.priority, status: 'queued', attempts: 0, max_attempts: item.maxAttempts,
        available_at: item.availableAt, enqueued_at: item.enqueuedAt, payload: item.payload ?? null,
      });
    }
    await recordAudit(client, gate.user.id, 'research.run.create', runId, { workflow: input.workflowKey });
    return { ok: true, data: { runId } };
  } catch (e) {
    return fail(e);
  }
}

export interface AdvanceRunResult { runId: string; from: string; to: string }

/**
 * Advance or transition a run through the state machine (curator/admin). Validates
 * via the engine; an invalid transition is refused (never silent). Appends an
 * audited event. NEVER auto-acts beyond the requested transition. NEVER throws.
 */
export async function transitionRun(
  id: string,
  to: EngineRunState | 'ADVANCE',
  now: string,
  reason?: string,
): Promise<DbResult<AdvanceRunResult>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data: row, error } = await client.from('hsin_research_runs').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Research run not found.', code: 'DB_ERROR' };
    const record = row as HsinResearchRunRecord;

    // Reconstruct a minimal engine run for validation.
    const engineRun: ResearchRun = {
      id, state: (record.state ?? 'CREATED') as EngineRunState, priority: (record.priority ?? 'NORMAL') as ResearchPriority,
      createdAt: record.created_at, updatedAt: record.updated_at ?? record.created_at, events: [],
    };
    const res =
      to === 'ADVANCE'
        ? advanceResearchRun(engineRun, { now, actor: gate.user.id, reason })
        : transitionResearchRun(engineRun, to, { now, actor: gate.user.id, reason });
    if (!res.ok) return validation(res.reason);

    await client.from('hsin_research_runs').update({ state: res.run.state }).eq('id', id);
    await client.from('hsin_research_run_events').insert({
      run_id: id, from_state: res.event.from, to_state: res.event.to, actor: gate.user.id, reason: res.event.reason, at: now,
    });
    await recordAudit(client, gate.user.id, 'research.run.transition', id, { from: res.event.from, to: res.event.to });
    return { ok: true, data: { runId: id, from: res.event.from, to: res.event.to } };
  } catch (e) {
    return fail(e);
  }
}

/** Accept (curator) a proposed opportunity → optionally spawns a run. Governed + audited. */
export async function decideOpportunity(
  id: string,
  decision: 'accepted' | 'rejected',
  now: string,
  reason?: string,
): Promise<DbResult<{ opportunityId: string; status: string; runId?: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data: row, error } = await client.from('hsin_research_opportunities').select('*').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Opportunity not found.', code: 'DB_ERROR' };
    const opp = row as HsinResearchOpportunityRecord;
    if (opp.status !== 'proposed') return validation(`Opportunity is already '${opp.status}'.`);

    await client.from('hsin_research_opportunities').update({ status: decision, reviewed_by: gate.user.id }).eq('id', id);

    let runId: string | undefined;
    if (decision === 'accepted') {
      const created = await createResearchRun(
        { title: opp.title, priority: opp.priority, opportunityId: id },
        now,
      );
      if (created.ok) runId = created.data.runId;
    }
    await recordAudit(client, gate.user.id, `research.opportunity.${decision}`, id, { reason, runId });
    return { ok: true, data: { opportunityId: id, status: decision, ...(runId ? { runId } : {}) } };
  } catch (e) {
    return fail(e);
  }
}

/** Resolve / acknowledge an escalation (curator). Governed + audited. NEVER auto-resolves on its own. */
export async function resolveEscalation(
  id: string,
  status: 'acknowledged' | 'resolved',
  resolution: string,
  now: string,
): Promise<DbResult<{ escalationId: string; status: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    const clean = (resolution ?? '').trim();
    if (status === 'resolved' && clean.length === 0) {
      return validation('Resolving an escalation requires a non-blank resolution note.');
    }
    const { data: row, error } = await client.from('hsin_research_escalations').select('id, status').eq('id', id).maybeSingle();
    if (error) return fail(error);
    if (!row) return { ok: false, error: 'Escalation not found.', code: 'DB_ERROR' };

    await client.from('hsin_research_escalations')
      .update({ status, resolution: clean || null, resolved_by: gate.user.id }).eq('id', id);
    await recordAudit(client, gate.user.id, `research.escalation.${status}`, id, { resolution: clean });
    return { ok: true, data: { escalationId: id, status } };
  } catch (e) {
    return fail(e);
  }
}

/** Seed the seven workflow templates (admin/curator). Idempotent upsert by template_key. */
export async function seedWorkflowTemplates(now: string): Promise<DbResult<{ seeded: number }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;
    let seeded = 0;
    for (const t of WORKFLOW_TEMPLATES) {
      const { data: existing } = await client.from('hsin_workflow_templates').select('id').eq('template_key', t.id).maybeSingle();
      const payload = {
        template_key: t.id, name: t.name, description: t.description,
        stages: { items: t.stages }, required_agents: { items: t.requiredAgents },
        required_evidence: t.requiredEvidence, governance_required: t.governanceRequired,
        created_by: gate.user.id,
      };
      if (existing?.id) {
        const { error } = await client.from('hsin_workflow_templates').update(payload).eq('id', existing.id as string);
        if (!error) seeded += 1;
      } else {
        const { error } = await client.from('hsin_workflow_templates').insert(payload);
        if (!error) seeded += 1;
      }
    }
    await recordAudit(client, gate.user.id, 'research.templates.seed', 'all', { seeded });
    return { ok: true, data: { seeded } };
  } catch (e) {
    return fail(e);
  }
}

async function recordAudit(
  client: SupabaseClient,
  userId: string | null,
  action: string,
  entityId: string,
  extra?: JsonRecord,
): Promise<void> {
  try {
    await client.from('audit_logs').insert({
      user_id: userId, action, metadata: { entity_type: 'orchestration', entity_id: entityId, ...(extra ?? {}) },
    });
  } catch {
    // Best-effort.
  }
}

// =============================================================================
// DEMO — labeled view-models from the engine fixtures (NOT_CONFIGURED path).
// =============================================================================

const DEMO_NOW = '2026-06-09T12:00:00.000Z';

function demoRuns(): HsinResearchRunRecord[] {
  const states: EngineRunState[] = ['DISCOVERING', 'EVIDENCING', 'TRUST', 'GOVERNANCE', 'COMPLETE', 'FAILED', 'ESCALATED'];
  return states.map((state, i) => ({
    id: `demo-run-${i}`,
    title: `Demo investigation ${i + 1}`,
    state,
    priority: (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const)[i % 4],
    workflow_key: 'historical-investigation',
    evidence_count: 3 + i,
    confidence: 0.6 + i * 0.03,
    trust_score: 70 - i * 4,
    outcome_status: state === 'COMPLETE' ? 'successful' : undefined,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  }));
}

/** Demo operations dashboard from the @hsi/research-orchestrator fixtures. */
export function demoOperationsDashboard(): OperationsDashboardData {
  const demo = orchestratorDemo();
  const runs = demoRuns();
  const tasks: HsinResearchTaskRecord[] = demo.tasks.map((t) => ({
    id: t.id, run_id: t.runId, agent_type: t.agentType, stage: t.stage, state: t.state,
    attempts: t.attempts, max_attempts: t.maxAttempts, runtime_ms: t.runtimeMs, created_at: DEMO_NOW, updated_at: DEMO_NOW,
  }));
  const queue: HsinResearchQueueRecord[] = runs.slice(0, 3).map((r, i) => ({
    id: `demo-q-${i}`, run_id: r.id, priority: r.priority, status: 'queued', attempts: 0, max_attempts: 3,
    available_at: DEMO_NOW, enqueued_at: DEMO_NOW, created_at: DEMO_NOW,
  }));
  const opportunities: HsinResearchOpportunityRecord[] = demo.opportunities.map((o) => ({
    id: o.id, title: o.title, reason: o.reason, confidence: o.confidence, priority: o.priority,
    source: o.source, entity_id: o.entityId, status: 'proposed', created_at: DEMO_NOW,
  }));
  const escalations: HsinResearchEscalationRecord[] = [
    {
      id: demo.escalation.id, run_id: demo.escalation.runId, trigger: demo.escalation.trigger,
      severity: demo.escalation.severity, reason: demo.escalation.reason, evidence: { items: demo.escalation.evidence },
      recommendation: demo.escalation.recommendation, status: 'open', created_at: DEMO_NOW,
    },
  ];
  const health: EngineHealthView[] = demo.health.map((h) => ({
    engine: h.engine, status: h.status, lastRun: h.lastRun, successRate: h.successRate,
    failureRate: h.failureRate, queueDepth: h.queueDepth, detail: h.detail,
  }));
  const agentPerformance: AgentPerformanceView[] = demo.agentHealth.map((h) => ({
    agentType: h.agentType, status: h.status, active: h.active, completed: h.completed,
    failed: h.failed, blocked: h.blocked, avgRuntimeMs: h.avgRuntimeMs, successRate: h.successRate,
  }));
  return {
    runsByState: countBy(runs, (r) => r.state ?? 'CREATED'),
    activeRuns: runs.filter((r) => ACTIVE_STATES.includes((r.state ?? '') as EngineRunState)),
    queue, queueDepth: queue.length, opportunities, escalations, health,
    overallStatus: worstStatus(health), agentPerformance,
    recentFailures: runs.filter((r) => r.state === 'FAILED' || r.state === 'ESCALATED'),
    governanceBacklog: runs.filter((r) => r.state === 'GOVERNANCE').length, avgTrust: 60,
  };
}

/** Demo runs list. */
export function demoResearchRuns(): ResearchRunsData {
  const runs = demoRuns();
  return { runs, byState: countBy(runs, (r) => r.state ?? 'CREATED') };
}

/** Demo run replay (drives the engine pipeline for a real event timeline). */
export function demoResearchRunReplay(id?: string): ResearchRunReplayData {
  const demo = orchestratorDemo();
  const run = demo.run;
  const events: HsinResearchRunEventRecord[] = run.events.map((e, i) => ({
    id: `demo-ev-${i}`, run_id: id ?? run.id, from_state: e.from, to_state: e.to, actor: e.actor, reason: e.reason, at: e.at, created_at: e.at,
  }));
  const tasks: HsinResearchTaskRecord[] = demo.tasks.map((t) => ({
    id: t.id, run_id: id ?? run.id, agent_type: t.agentType, stage: t.stage, state: t.state,
    attempts: t.attempts, max_attempts: t.maxAttempts, runtime_ms: t.runtimeMs, created_at: DEMO_NOW, updated_at: DEMO_NOW,
  }));
  const assignments: HsinAgentAssignmentRecord[] = demo.tasks.map((t, i) => ({
    id: `demo-asg-${i}`, run_id: id ?? run.id, task_id: t.id, agent_type: t.agentType, stage: t.stage, assigned_at: DEMO_NOW, created_at: DEMO_NOW,
  }));
  return {
    run: {
      id: id ?? run.id, title: run.title, state: run.state, priority: run.priority, workflow_key: run.workflow,
      evidence_count: 5, confidence: 0.74, trust_score: 73, outcome_status: 'successful', created_at: run.createdAt, updated_at: run.updatedAt,
    },
    events, tasks, assignments, escalations: [], progress: pipelineProgress(run.state),
  };
}

/** Demo platform health. */
export function demoPlatformHealth(): PlatformHealthData {
  const d = demoOperationsDashboard();
  return { health: d.health, overallStatus: d.overallStatus, agentPerformance: d.agentPerformance };
}

/** Demo opportunities. */
export function demoOpportunities(): OpportunitiesData {
  const opportunities = demoOperationsDashboard().opportunities;
  return { opportunities, proposedCount: opportunities.length, acceptedCount: 0, rejectedCount: 0 };
}

/** Demo escalations. */
export function demoEscalations(): EscalationsData {
  const escalations = demoOperationsDashboard().escalations;
  const bySeverity: Record<EscalationSeverity, number> = { INFO: 0, WARNING: 0, HIGH: 0, CRITICAL: 0 };
  for (const e of escalations) if (e.severity) bySeverity[e.severity] += 1;
  return { escalations, bySeverity, openCount: escalations.length };
}

export { db as orchestrationDbClient, requireRole as requireOrchestrationRole };
