// =============================================================================
// apps/worker/jobs — operationsWorkerJob (WorldForge/HSI Phase 24)
//
// The HUMAN OPERATIONS loop. Every 30 minutes it refreshes workload rollups +
// capacity, detects overdue work, and writes advisory operational alerts — in
// fault-isolated, retry-safe, deterministic, offline-safe steps (each wrapped —
// a failure logs + continues; NEVER throws):
//
//   1. LOAD     — active assignments + escalations → normalized CaseRecords.
//   2. COMPUTE  — per-assignee + per-team workload; advisory alerts (engine).
//   3. PERSIST  — upsert workloads; insert new operational alerts.
//
// PURITY: @hsi/operations-engine is pure & deterministic; `now` is INJECTED
// (ctx.runAt). OFFLINE-SAFE: no service-role env → runs the fixtures + logs, no
// writes. GOVERNANCE: NEVER auto-assigns, auto-escalates, auto-approves, or
// auto-publishes — alerts/workloads are advisory; every action stays human.
//
// SCHEDULING: cron '*/30 * * * *' (every 30 minutes).
// =============================================================================

import {
  computeTeamWorkload,
  computeWorkload,
  detectOpsAlerts,
  operationsDemo,
  type CaseRecord,
  type EscalationLevel,
  type LifecycleState,
  type TeamKey,
} from '@hsi/operations-engine';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface OperationsWorkerResult {
  mode: 'db' | 'offline';
  cases: number;
  workloadsWritten: number;
  alertsGenerated: number;
}

interface OpsClient {
  from(table: string): {
    select: (cols?: string) => { eq: (c: string, v: unknown) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> }; limit: (n: number) => Promise<{ data: unknown; error: unknown }> };
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function tryClient(): OpsClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as OpsClient;
  } catch (e) {
    logger.warn('operations.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

const TEAM_KEYS: TeamKey[] = ['research', 'review', 'curation', 'governance', 'executive', 'security', 'publishing', 'simulation'];
function asTeam(v: unknown): TeamKey {
  return TEAM_KEYS.includes(String(v) as TeamKey) ? (String(v) as TeamKey) : 'research';
}

async function safeRows(client: OpsClient, build: () => Promise<{ data: unknown; error: unknown }>): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await build();
    if (error || !Array.isArray(data)) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}

/** Run the operations loop. Deterministic (`now` injected). Offline-safe. NEVER throws. */
export async function runOperationsStage(now: string, opts?: { client?: OpsClient | null }): Promise<OperationsWorkerResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();
  if (!client) return offlineResult(now);

  const result: OperationsWorkerResult = { mode: 'db', cases: 0, workloadsWritten: 0, alertsGenerated: 0 };

  // --- 1. LOAD: build CaseRecords from active assignments + escalations -------
  let cases: CaseRecord[] = [];
  try {
    const assignments = await safeRows(client, () => client.from('assignments').select('case_id, role, assignee, case_kind').eq('active', true).limit(5000));
    const escalations = await safeRows(client, () => client.from('escalations').select('case_id, level').eq('active', true).limit(5000));
    const escByCase = new Map<string, EscalationLevel>();
    for (const e of escalations) escByCase.set(String(e.case_id ?? ''), String(e.level ?? 'LOW') as EscalationLevel);
    const seen = new Map<string, CaseRecord>();
    for (const a of assignments) {
      const id = String(a.case_id ?? '');
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        id, title: id, state: 'RESEARCH' as LifecycleState, team: asTeam(a.case_kind),
        assignee: a.assignee ? String(a.assignee) : null,
        escalation: escByCase.get(id) ?? 'LOW',
        createdAt: now, updatedAt: now,
      });
    }
    cases = [...seen.values()];
    result.cases = cases.length;
  } catch (e) {
    logger.warn('operations.load.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- 2-3. COMPUTE + PERSIST workloads + alerts -----------------------------
  try {
    const byAssignee = computeWorkload(cases, now);
    const byTeam = computeTeamWorkload(cases, {}, now);
    for (const r of byAssignee) {
      const { error } = await client.from('workloads').insert({ scope: 'assignee', scope_id: r.assignee, assigned: r.assigned, open_count: r.open, overdue: r.overdue, escalated: r.escalated, details: { byState: r.byState }, computed_at: now });
      if (!error) result.workloadsWritten += 1;
    }
    for (const t of byTeam) {
      const { error } = await client.from('workloads').insert({ scope: 'team', scope_id: t.team, assigned: t.open, open_count: t.open, overdue: t.overdue, escalated: t.escalated, details: { members: t.members, loadPerMember: Number.isFinite(t.loadPerMember) ? t.loadPerMember : 99, status: t.status }, computed_at: now });
      if (!error) result.workloadsWritten += 1;
    }
    for (const a of detectOpsAlerts(cases, byTeam, now)) {
      const { error } = await client.from('operations_alerts').insert({ kind: a.kind, severity: a.severity, title: a.title, detail: a.detail, case_id: a.caseId ?? null, team: a.team ?? null, status: 'open' });
      if (!error) result.alertsGenerated += 1;
    }
  } catch (e) {
    logger.warn('operations.compute.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  logger.info('operations.done', { ...result, autoAssign: false, autoEscalate: false, autoApprove: false, autoPublish: false });
  return result;
}

function offlineResult(now: string): OperationsWorkerResult {
  const d = operationsDemo();
  const result: OperationsWorkerResult = {
    mode: 'offline',
    cases: d.workload.length,
    workloadsWritten: 0,
    alertsGenerated: d.alerts.length,
  };
  logger.info('operations.offline', { ...result, now, autoAssign: false, autoEscalate: false, autoApprove: false, autoPublish: false });
  return result;
}

/** The Job wrapper (every 30 minutes). */
export function makeOperationsWorkerJob(): Job {
  return {
    name: 'operationsWorker',
    description:
      'Every 30 min: refresh workload rollups + capacity, detect overdue work, and write advisory operational alerts. NEVER auto-assigns/auto-escalates/auto-approves/auto-publishes — operations stay human-controlled.',
    schedule: '*/30 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const offline = !serviceRoleConfigured();
      const declaredInputs = { mode: offline ? 'offline-fixtures' : 'db', runAt: now, autoAssign: false, autoEscalate: false, autoApprove: false, autoPublish: false };
      logger.info('job.operationsWorker.start', { declaredInputs });
      let summary: OperationsWorkerResult;
      try {
        summary = await runOperationsStage(now);
      } catch (e) {
        logger.warn('job.operationsWorker.failed', { error: e instanceof Error ? e.message : String(e) });
        summary = { mode: offline ? 'offline' : 'db', cases: 0, workloadsWritten: 0, alertsGenerated: 0 };
      }
      logger.info('job.operationsWorker.done', { summary });
      return { job: 'operationsWorker', ok: true, declaredInputs, summary: { ...summary, autoAssign: false, autoEscalate: false, autoApprove: false, autoPublish: false } };
    },
  };
}

/** The registered Phase-24 operations job instance. */
export const operationsWorkerJob: Job = makeOperationsWorkerJob();
