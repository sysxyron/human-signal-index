// =============================================================================
// HSI Phase 24 — Human Operations data-access layer. SERVER-ONLY.
//
// Reads the operational tables (migration 0027) and assembles the dashboard
// view-models; the worker pre-computes workloads + alerts. Governed WRITES
// (assign / reassign / escalate / transition / resolve-alert) use the PURE
// @hsi/operations-engine to validate, then persist + write an operations audit
// event. Reviewer+ to write; researcher+ to read; admin all (enforced by RLS and
// re-checked here). ADVISORY: nothing here publishes, approves, or governs.
//
// NEVER throws; empty env → NOT_CONFIGURED → the page renders a labeled demo.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole, type AppRole } from '@/lib/security/rbac-audit';
import {
  escalate as engineEscalate,
  transition as engineTransition,
  type EscalationLevel,
  type LifecycleState,
} from '@hsi/operations-engine';
import type {
  HsinOpsAlertRecord,
  HsinEscalationRecord,
  OperationsAlertsData,
  OperationsCenterData,
  OpsTeamWorkloadView,
  TeamsData,
  WorkloadsData,
} from '@hsi/shared-types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED = 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('operations-os/persistence', error);
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}
function configured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}

type JsonRecord = Record<string, unknown>;
async function safeRows(client: SupabaseClient, table: string, build: (q: ReturnType<SupabaseClient['from']>) => unknown): Promise<JsonRecord[]> {
  try {
    const { data, error } = (await build(client.from(table))) as { data: JsonRecord[] | null; error: unknown };
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

async function gate(min: AppRole): Promise<{ ok: true; user: User; client: SupabaseClient; role: AppRole } | { ok: false; error: string; code: DbResultCode }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };
  const client = createClient();
  const role = (await loadHighestRole(client, user.id)) ?? 'viewer';
  if (!hasRole(role, min)) return { ok: false, error: `Requires the ${min} role or higher.`, code: 'FORBIDDEN' };
  return { ok: true, user, client, role };
}

function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

// =============================================================================
// READS (researcher+). Each returns NOT_CONFIGURED when env is absent so the page
// shows a labeled demo.
// =============================================================================

export async function getWorkloads(): Promise<DbResult<WorkloadsData>> {
  try {
    const g = await gate('researcher');
    if (!g.ok) return g;
    if (!configured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    const rows = await safeRows(g.client, 'workloads', (q) => q.select('*').order('open_count', { ascending: false }).limit(1000));
    const byAssignee = rows.filter((r) => r.scope === 'assignee').map((r) => ({ assignee: String(r.scope_id ?? ''), assigned: num(r.assigned), open: num(r.open_count), overdue: num(r.overdue), escalated: num(r.escalated) }));
    const byTeam: OpsTeamWorkloadView[] = rows.filter((r) => r.scope === 'team').map((r) => {
      const d = (r.details ?? {}) as JsonRecord;
      return { team: String(r.scope_id ?? ''), members: num(d.members), open: num(r.open_count), overdue: num(r.overdue), escalated: num(r.escalated), loadPerMember: num(d.loadPerMember), status: (d.status as OpsTeamWorkloadView['status']) ?? 'healthy' };
    });
    const totals = { open: byAssignee.reduce((a, r) => a + r.open, 0), overdue: byAssignee.reduce((a, r) => a + r.overdue, 0), escalated: byAssignee.reduce((a, r) => a + r.escalated, 0), reviewBacklog: 0, publicationBacklog: 0 };
    return { ok: true, data: { byAssignee, byTeam, totals } };
  } catch (e) {
    return fail(e);
  }
}

export async function getOperationsAlerts(): Promise<DbResult<OperationsAlertsData>> {
  try {
    const g = await gate('researcher');
    if (!g.ok) return g;
    if (!configured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    const rows = await safeRows(g.client, 'operations_alerts', (q) => q.select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(500));
    const alerts = rows as unknown as HsinOpsAlertRecord[];
    const bySeverity: Record<string, number> = {};
    for (const a of alerts) bySeverity[a.severity ?? 'warning'] = (bySeverity[a.severity ?? 'warning'] ?? 0) + 1;
    return { ok: true, data: { alerts, bySeverity } };
  } catch (e) {
    return fail(e);
  }
}

export async function getTeams(): Promise<DbResult<TeamsData>> {
  try {
    const g = await gate('researcher');
    if (!g.ok) return g;
    if (!configured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    const [teams, members, workloads] = await Promise.all([
      safeRows(g.client, 'teams', (q) => q.select('*').limit(50)),
      safeRows(g.client, 'team_members', (q) => q.select('team_id').limit(5000)),
      safeRows(g.client, 'workloads', (q) => q.select('*').eq('scope', 'team').limit(50)),
    ]);
    const memberCount = new Map<string, number>();
    for (const m of members) memberCount.set(String(m.team_id ?? ''), (memberCount.get(String(m.team_id ?? '')) ?? 0) + 1);
    const wlByTeam = new Map<string, JsonRecord>();
    for (const w of workloads) wlByTeam.set(String(w.scope_id ?? ''), w);
    return {
      ok: true,
      data: {
        teams: teams.map((t) => {
          const w = wlByTeam.get(String(t.key ?? ''));
          const d = (w?.details ?? {}) as JsonRecord;
          return { key: String(t.key ?? ''), name: String(t.name ?? ''), members: memberCount.get(String(t.id ?? '')) ?? num(d.members), open: num(w?.open_count), overdue: num(w?.overdue), status: String(d.status ?? 'healthy') };
        }),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getOperationsCenter(): Promise<DbResult<OperationsCenterData>> {
  try {
    const g = await gate('researcher');
    if (!g.ok) return g;
    if (!configured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    const [wl, al, esc] = await Promise.all([getWorkloads(), getOperationsAlerts(), safeRows(g.client, 'escalations', (q) => q.select('*').eq('active', true).limit(500))]);
    const workloads: WorkloadsData = wl.ok ? wl.data : { byAssignee: [], byTeam: [], totals: { open: 0, overdue: 0, escalated: 0, reviewBacklog: 0, publicationBacklog: 0 } };
    const alerts = al.ok ? al.data.alerts : [];
    const escalations = esc as unknown as HsinEscalationRecord[];
    return {
      ok: true,
      data: {
        workloads, alerts, escalations, teamHealth: workloads.byTeam,
        openCases: workloads.totals.open, overdueCases: workloads.totals.overdue,
        criticalEscalations: escalations.filter((e) => e.level === 'CRITICAL').length,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getOperationsHighlights(): Promise<DbResult<import('@hsi/shared-types').OperationsHighlights>> {
  try {
    const g = await gate('researcher');
    if (!g.ok) return g;
    if (!configured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    const [wl, al, esc] = await Promise.all([getWorkloads(), getOperationsAlerts(), safeRows(g.client, 'escalations', (q) => q.select('level').eq('active', true).limit(1000))]);
    const w = wl.ok ? wl.data.totals : { open: 0, overdue: 0, escalated: 0, reviewBacklog: 0, publicationBacklog: 0 };
    return {
      ok: true,
      data: {
        openCases: w.open, overdueCases: w.overdue,
        criticalEscalations: esc.filter((e) => e.level === 'CRITICAL').length,
        reviewBacklog: w.reviewBacklog, publicationBacklog: w.publicationBacklog,
        openAlerts: al.ok ? al.data.alerts.length : 0,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function getExecutiveOperations(): Promise<DbResult<import('@hsi/shared-types').ExecutiveOperationsData>> {
  try {
    const g = await gate('researcher');
    if (!g.ok) return g;
    if (!configured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
    const wl = await getWorkloads();
    const teamCapacity = wl.ok ? wl.data.byTeam : [];
    const esc = await safeRows(g.client, 'escalations', (q) => q.select('level').eq('active', true).limit(1000));
    const worst: 'healthy' | 'busy' | 'overloaded' = teamCapacity.some((t) => t.status === 'overloaded') ? 'overloaded' : teamCapacity.some((t) => t.status === 'busy') ? 'busy' : 'healthy';
    return {
      ok: true,
      data: {
        researchBacklog: teamCapacity.find((t) => t.team === 'research')?.open ?? 0,
        reviewBacklog: wl.ok ? wl.data.totals.reviewBacklog : 0,
        publicationQueue: wl.ok ? wl.data.totals.publicationBacklog : 0,
        criticalEscalations: esc.filter((e) => e.level === 'CRITICAL').length,
        openInvestigations: wl.ok ? wl.data.totals.open : 0,
        teamCapacity,
        forecastedCapacity: [],
        avgResolutionMs: null,
        operationalHealth: worst,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WRITES (reviewer+). Validated by the pure engine; audited to
// operations_audit_events. No publication/approval/governance side effects.
// =============================================================================

async function recordAudit(client: SupabaseClient, actor: string, eventType: string, caseId: string, summary: string, reason: string, now: string): Promise<void> {
  try {
    await client.from('operations_audit_events').insert({ event_type: eventType, case_id: caseId, actor, summary, reason, at: now });
  } catch {
    /* best-effort */
  }
}

export async function assignCaseDal(input: { caseId: string; role: string; assignee: string; reason: string; notes?: string }, now: string): Promise<DbResult<{ assignmentId: string }>> {
  try {
    const g = await gate('reviewer');
    if (!g.ok) return g;
    if (!input.caseId || !input.assignee || !input.reason) return { ok: false, error: 'caseId, assignee, and reason are required.', code: 'DB_ERROR' };
    const { data, error } = await g.client.from('assignments').insert({ case_id: input.caseId, role: input.role, assignee: input.assignee, assigner: g.user.id, reason: input.reason, notes: input.notes ?? null, assigned_at: now, active: true }).select('id').single();
    if (error || !data?.id) return fail(error ?? new Error('Assignment insert returned no id.'));
    await g.client.from('assignment_history').insert({ case_id: input.caseId, role: input.role, action: 'assigned', to_user: input.assignee, actor: g.user.id, reason: input.reason, at: now });
    await recordAudit(g.client, g.user.id, 'assignment', input.caseId, `Assigned ${input.role} to ${input.assignee}`, input.reason, now);
    return { ok: true, data: { assignmentId: data.id as string } };
  } catch (e) {
    return fail(e);
  }
}

export async function escalateCaseDal(input: { caseId: string; from: EscalationLevel | null; to: EscalationLevel; reason: string }, now: string): Promise<DbResult<{ level: EscalationLevel }>> {
  try {
    const g = await gate('reviewer');
    if (!g.ok) return g;
    let result;
    try {
      result = engineEscalate(input.from, input.to, { caseId: input.caseId, actor: g.user.id, reason: input.reason }, { now });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid escalation.', code: 'DB_ERROR' };
    }
    await g.client.from('escalations').insert({ case_id: input.caseId, level: result.escalation.level, raised_by: g.user.id, reason: input.reason, active: result.escalation.active });
    await recordAudit(g.client, g.user.id, 'escalation', input.caseId, `Escalated to ${result.escalation.level}`, input.reason, now);
    return { ok: true, data: { level: result.escalation.level } };
  } catch (e) {
    return fail(e);
  }
}

export async function transitionCaseDal(input: { caseId: string; from: LifecycleState; to: LifecycleState; reason: string }, now: string): Promise<DbResult<{ state: LifecycleState }>> {
  try {
    const g = await gate('reviewer');
    if (!g.ok) return g;
    const result = engineTransition(input.from, input.to, { actor: g.user.id, reason: input.reason }, { now });
    if (!result.ok) return { ok: false, error: result.reason, code: 'DB_ERROR' };
    await recordAudit(g.client, g.user.id, 'status_transition', input.caseId, `${input.from} → ${input.to}`, input.reason, now);
    return { ok: true, data: { state: result.state } };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveAlertDal(alertId: string, now: string): Promise<DbResult<{ id: string }>> {
  try {
    const g = await gate('reviewer');
    if (!g.ok) return g;
    const { error } = await g.client.from('operations_alerts').update({ status: 'resolved', resolved_by: g.user.id }).eq('id', alertId);
    if (error) return fail(error);
    await recordAudit(g.client, g.user.id, 'completion', alertId, 'Resolved operational alert', 'Acknowledged by reviewer', now);
    return { ok: true, data: { id: alertId } };
  } catch (e) {
    return fail(e);
  }
}
