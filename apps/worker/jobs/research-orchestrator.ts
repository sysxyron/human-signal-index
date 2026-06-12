// =============================================================================
// apps/worker/jobs — researchOrchestratorJob (WorldForge/HSI Phase 18)
//
// The WORKER ORCHESTRATION loop for the Intelligence Operations Center. It drives
// research runs through the pipeline in fault-isolated, retry-safe, deterministic,
// offline-safe steps (each wrapped — a failure logs + continues; NEVER throws):
//
//   1. QUEUE POLL      — dequeue the highest-priority READY items.
//   2. AGENT ASSIGN    — assign the agent the run's next stage needs.
//   3. WORKFLOW STEP   — advance the run one state (audited event); complete the
//                        queue item when the run reaches a human gate / COMPLETE.
//   4. FAILURE HANDLE  — re-queue retryable failures; escalate the exhausted.
//   5. ESCALATION      — raise escalations for repeated failures + queue blockage.
//   6. TRUST/GOVERNANCE— runs that reach TRUST / GOVERNANCE are LEFT for humans
//                        (the worker never auto-decides / auto-acts).
//
// PURITY: the engines (@hsi/research-orchestrator, @hsi/intelligence-queue) are
// pure & deterministic; `now` is INJECTED (ctx.runAt). NO Date.now()/Math.random().
// OFFLINE-SAFE: no service-role env → runs the orchestrator fixtures + logs, no
// writes. GOVERNANCE: opportunities/escalations/overrides stay human-approved.
//
// SCHEDULING: cron '*/15 * * * *' (every 15 min) — continuous operation.
// =============================================================================

import {
  advanceResearchRun,
  agentForStage,
  escalateResearchIssue,
  orchestratorDemo,
  type ResearchRun,
  type ResearchRunState,
} from '@hsi/research-orchestrator';
import {
  dequeueResearch,
  completeResearch,
  failResearch,
  type QueueItem,
  type QueuePriority,
} from '@hsi/intelligence-queue';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Max items processed per poll (keeps a single run bounded). */
export const ORCHESTRATOR_BATCH = 10;
/** Queue depth at/above which a blockage is escalated when nothing is ready. */
export const QUEUE_BLOCKAGE_DEPTH = 25;

export interface OrchestratorResult {
  mode: 'db' | 'offline';
  polled: number;
  advanced: number;
  assigned: number;
  completed: number;
  failed: number;
  escalations: number;
}

/** Minimal structural shape of the Supabase bits this job uses. */
type OrcQuery = {
  eq: (col: string, val: unknown) => OrcQuery;
  in: (col: string, vals: unknown[]) => OrcQuery;
  order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => OrcQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
};
interface OrcClient {
  from(table: string): {
    select: (cols?: string) => OrcQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
    update: (values: unknown) => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> };
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
function tryClient(): OrcClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as OrcClient;
  } catch (e) {
    logger.warn('orchestrator.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

const HUMAN_GATES: ResearchRunState[] = ['TRUST', 'GOVERNANCE'];

/**
 * Run the orchestration loop. Deterministic (`now` injected). Offline-safe (no
 * service-role env → fixtures + log). NEVER throws. Returns the counts.
 */
export async function runResearchOrchestrator(
  now: string,
  opts?: { client?: OrcClient | null; batch?: number },
): Promise<OrchestratorResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();
  if (!client) return offlineResult(now);

  const batch = opts?.batch ?? ORCHESTRATOR_BATCH;
  const result: OrchestratorResult = {
    mode: 'db', polled: 0, advanced: 0, assigned: 0, completed: 0, failed: 0, escalations: 0,
  };

  // --- Load the active queue --------------------------------------------------
  let queue: QueueItem[] = [];
  try {
    const { data } = await client
      .from('hsin_research_queue').select('*')
      .in('status', ['queued', 'retrying', 'active']).limit(2000);
    queue = ((data ?? []) as Array<Record<string, unknown>>).map(rowToQueueItem);
  } catch (e) {
    logger.warn('orchestrator.queue.load.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- Step 1-3: poll → advance → assign -------------------------------------
  for (let i = 0; i < batch; i++) {
    const deq = dequeueResearch(queue, { now });
    if (!deq.ok || !deq.data.item) break;
    queue = deq.data.queue;
    const item = deq.data.item;
    result.polled += 1;

    try {
      const handled = await processItem(client, item, now, result);
      if (handled.completed) {
        const c = completeResearch(queue, item.id, { now });
        if (c.ok) queue = c.data.queue;
      }
    } catch (e) {
      result.failed += 1;
      const f = failResearch(queue, item.id, e instanceof Error ? e.message : String(e), { now });
      if (f.ok) {
        queue = f.data.queue;
        await persistQueueItem(client, f.data.queue.find((q) => q.id === item.id));
        if (!f.data.willRetry) {
          // Exhausted → escalate repeated failures.
          await raiseEscalation(client, item.runId, 'repeated_failures', now, [
            `Run ${item.runId} failed past its retry budget (${item.attempts}/${item.maxAttempts}).`,
          ]);
          result.escalations += 1;
        }
      }
    }
  }

  // --- Step 5: queue blockage escalation -------------------------------------
  try {
    const readyNow = queue.filter((q) => (q.status === 'queued' || q.status === 'retrying'));
    const futureReady = readyNow.filter((q) => Date.parse(q.availableAt) <= Date.parse(now));
    if (queue.length >= QUEUE_BLOCKAGE_DEPTH && futureReady.length === 0 && result.polled === 0) {
      await raiseEscalation(client, undefined, 'queue_blockage', now, [
        `Queue depth ${queue.length} with no ready items — the queue may be blocked.`,
      ]);
      result.escalations += 1;
    }
  } catch (e) {
    logger.warn('orchestrator.blockage.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  logger.info('orchestrator.done', { ...result, autoActed: false, autoPublished: false });
  return result;
}

/** Advance one run + assign its agent + persist. Returns whether the run is done. */
async function processItem(
  client: OrcClient,
  item: QueueItem,
  now: string,
  result: OrchestratorResult,
): Promise<{ completed: boolean }> {
  // Load the run.
  const { data: rows } = await client.from('hsin_research_runs').select('*').eq('id', item.runId).limit(1);
  const row = ((rows ?? []) as Array<Record<string, unknown>>)[0];
  if (!row) return { completed: true }; // orphaned queue item → complete it.

  const run: ResearchRun = {
    id: item.runId,
    state: String(row.state ?? 'CREATED') as ResearchRunState,
    priority: (String(row.priority ?? 'NORMAL') as QueuePriority),
    createdAt: String(row.created_at ?? now),
    updatedAt: String(row.updated_at ?? now),
    events: [],
  };

  // A run sitting at a human gate is LEFT for humans — complete the queue item.
  if (HUMAN_GATES.includes(run.state)) {
    return { completed: true };
  }

  const adv = advanceResearchRun(run, { now, actor: 'orchestrator' });
  if (!adv.ok) {
    // Terminal / off-pipeline (COMPLETE/FAILED/ESCALATED) — drain the queue item.
    return { completed: true };
  }

  // Persist the new state + event.
  await updateRunState(client, run.id, adv.run.state, now);
  await insertEvent(client, adv.event.runId, adv.event.from, adv.event.to, adv.event.reason, now);
  result.advanced += 1;

  // Assign the agent the new stage needs.
  const agent = agentForStage(adv.run.state);
  if (agent) {
    const assigned = await insertTaskAndAssignment(client, run.id, adv.run.state, agent, now);
    if (assigned) result.assigned += 1;
  }

  // COMPLETE → done; otherwise leave queued for the next poll (re-enqueue).
  if (adv.run.state === 'COMPLETE') {
    result.completed += 1;
    return { completed: true };
  }
  // Re-arm: set the queue item back to queued so the next poll advances it again.
  await reArmQueueItem(client, item.id, now);
  return { completed: false };
}

// --- persistence helpers (all NEVER throw) ----------------------------------

function rowToQueueItem(r: Record<string, unknown>): QueueItem {
  return {
    id: String(r.id ?? ''),
    runId: String(r.run_id ?? ''),
    priority: (String(r.priority ?? 'NORMAL') as QueuePriority),
    status: (String(r.status ?? 'queued') as QueueItem['status']),
    attempts: Number(r.attempts ?? 0),
    maxAttempts: Number(r.max_attempts ?? 3),
    enqueuedAt: String(r.enqueued_at ?? r.created_at ?? ''),
    availableAt: String(r.available_at ?? r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? r.created_at ?? ''),
  };
}

async function updateRunState(client: OrcClient, runId: string, state: string, now: string): Promise<void> {
  try {
    await client.from('hsin_research_runs').update({ state }).eq('id', runId);
  } catch (e) {
    logger.warn('orchestrator.run.update.failed', { runId, error: e instanceof Error ? e.message : String(e) });
  }
}

async function insertEvent(
  client: OrcClient, runId: string, from: string, to: string, reason: string, now: string,
): Promise<void> {
  try {
    await client.from('hsin_research_run_events').insert({
      run_id: runId, from_state: from, to_state: to, actor: 'orchestrator', reason, at: now,
    });
  } catch (e) {
    logger.warn('orchestrator.event.insert.failed', { runId, error: e instanceof Error ? e.message : String(e) });
  }
}

async function insertTaskAndAssignment(
  client: OrcClient, runId: string, stage: string, agentType: string, now: string,
): Promise<boolean> {
  try {
    await client.from('hsin_research_tasks').insert({
      run_id: runId, task_key: `${runId}:${stage}:${agentType}`, agent_type: agentType, stage,
      state: 'pending', attempts: 0, max_attempts: 3, runtime_ms: 0,
    });
    await client.from('hsin_agent_assignments').insert({
      run_id: runId, agent_type: agentType, stage, assigned_at: now,
    });
    return true;
  } catch (e) {
    logger.warn('orchestrator.assign.failed', { runId, error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

async function reArmQueueItem(client: OrcClient, id: string, now: string): Promise<void> {
  try {
    await client.from('hsin_research_queue').update({ status: 'queued', available_at: now }).eq('id', id);
  } catch (e) {
    logger.warn('orchestrator.queue.rearm.failed', { id, error: e instanceof Error ? e.message : String(e) });
  }
}

async function persistQueueItem(client: OrcClient, item: QueueItem | undefined): Promise<void> {
  if (!item) return;
  try {
    await client.from('hsin_research_queue').update({
      status: item.status, attempts: item.attempts, available_at: item.availableAt, last_error: item.lastError ?? null,
    }).eq('id', item.id);
  } catch (e) {
    logger.warn('orchestrator.queue.persist.failed', { id: item.id, error: e instanceof Error ? e.message : String(e) });
  }
}

async function raiseEscalation(
  client: OrcClient,
  runId: string | undefined,
  trigger: Parameters<typeof escalateResearchIssue>[0]['trigger'],
  now: string,
  evidence: string[],
): Promise<void> {
  try {
    const esc = escalateResearchIssue({ id: 'pending', trigger, runId, evidence }, { now });
    await client.from('hsin_research_escalations').insert({
      run_id: esc.runId ?? null, trigger: esc.trigger, severity: esc.severity, reason: esc.reason,
      evidence: { items: esc.evidence }, recommendation: esc.recommendation, status: 'open',
    });
  } catch (e) {
    logger.warn('orchestrator.escalation.insert.failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Offline-safe result: run the fixtures deterministically, log, persist nothing. */
function offlineResult(now: string): OrchestratorResult {
  const demo = orchestratorDemo();
  const result: OrchestratorResult = {
    mode: 'offline',
    polled: 1,
    advanced: demo.run.events.length,
    assigned: demo.tasks.length,
    completed: demo.run.state === 'COMPLETE' ? 1 : 0,
    failed: 0,
    escalations: 1,
  };
  logger.info('orchestrator.offline', { ...result, autoActed: false, autoPublished: false });
  return result;
}

/** The Job wrapper (scheduled every 15 minutes). */
export function makeResearchOrchestratorJob(): Job {
  return {
    name: 'researchOrchestrator',
    description:
      'Continuous orchestration loop: poll the research queue → assign agents → advance the workflow → handle failures → escalate (never auto-decides, never auto-publishes; trust/governance left for humans).',
    schedule: '*/15 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const offline = !serviceRoleConfigured();
      const declaredInputs = { mode: offline ? 'offline-fixtures' : 'db', runAt: now, autoAct: false, autoPublish: false };
      logger.info('job.researchOrchestrator.start', { declaredInputs });

      let summary: OrchestratorResult;
      try {
        summary = await runResearchOrchestrator(now);
      } catch (e) {
        logger.warn('job.researchOrchestrator.failed', { error: e instanceof Error ? e.message : String(e) });
        summary = { mode: offline ? 'offline' : 'db', polled: 0, advanced: 0, assigned: 0, completed: 0, failed: 0, escalations: 0 };
      }

      logger.info('job.researchOrchestrator.done', { summary, autoActed: false, autoPublished: false });
      return {
        job: 'researchOrchestrator',
        ok: true,
        declaredInputs,
        summary: { ...summary, autoActed: false, autoPublished: false },
      };
    },
  };
}

/** The registered Phase-18 orchestration job instance. */
export const researchOrchestratorJob: Job = makeResearchOrchestratorJob();
