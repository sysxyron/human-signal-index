// =============================================================================
// HSI Phase 66 — Agent DAL (SERVER-ONLY). Reads/writes the agent tables through
// the caller's RLS client (reviewer+ read, admin manage). Reuses the Phase 62
// notification DAL for alert delivery. Never throws; degrades to empty.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotificationDal, getPreferencesDal } from '@/lib/notifications/persistence';
import { shouldDeliver, type NotificationSeverity } from '@/lib/notifications/types';
import {
  type Agent, type AgentRun, type AgentMetrics, type AgentResultRow, type Finding,
  type ScheduleCadence, type RunStatus, type RunTrigger, type AgentAlertType, type AgentKey,
  isScheduleCadence, successRate, nextRunAt,
} from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmt(iso?: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; }

// ---- agents + schedules -----------------------------------------------------

export async function listAgents(db: SupabaseClient): Promise<Agent[]> {
  try {
    const [{ data: agents }, { data: scheds }] = await Promise.all([
      db.from('agents').select('agent_key, name, description, category, enabled').order('agent_key'),
      db.from('agent_schedules').select('agent_key, cadence, last_run_at, next_run_at'),
    ]);
    const schedById = new Map<string, { cadence: string; last_run_at: string | null; next_run_at: string | null }>();
    for (const s of (scheds ?? []) as Array<{ agent_key: string; cadence: string; last_run_at: string | null; next_run_at: string | null }>) schedById.set(s.agent_key, s);
    return ((agents ?? []) as Array<Record<string, unknown>>).map((a) => {
      const s = schedById.get(a.agent_key as string);
      return {
        agentKey: a.agent_key as AgentKey, name: (a.name as string) ?? '', description: (a.description as string) ?? null,
        category: (a.category as string) ?? null, enabled: (a.enabled as boolean) ?? true,
        cadence: (isScheduleCadence(s?.cadence) ? s!.cadence : 'manual') as ScheduleCadence,
        lastRunAt: s?.last_run_at ?? null, nextRunAt: s?.next_run_at ?? null,
      };
    });
  } catch { return []; }
}

export async function getAgentDal(db: SupabaseClient, agentKey: string): Promise<Agent | null> {
  const all = await listAgents(db);
  return all.find((a) => a.agentKey === agentKey) ?? null;
}

export async function setSchedule(writer: SupabaseClient, agentKey: string, cadence: ScheduleCadence, lastRunAt?: string): Promise<void> {
  try {
    const patch: Record<string, unknown> = { agent_key: agentKey, cadence, updated_at: new Date().toISOString() };
    if (lastRunAt) { patch.last_run_at = lastRunAt; patch.next_run_at = nextRunAt(cadence, lastRunAt); }
    else patch.next_run_at = nextRunAt(cadence, new Date().toISOString());
    await writer.from('agent_schedules').upsert(patch, { onConflict: 'agent_key' });
  } catch { /* best-effort */ }
}

// ---- runs / actions / results ----------------------------------------------

export async function createRun(writer: SupabaseClient, agentKey: string, trigger: RunTrigger, actorId: string | null): Promise<string | null> {
  try {
    const { data, error } = await writer.from('agent_runs').insert({ agent_key: agentKey, status: 'running', trigger, actor_id: actorId }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}

export async function finishRun(writer: SupabaseClient, runId: string, patch: { status: RunStatus; durationMs: number; findingsCount: number; alertsCount: number; error?: string | null }): Promise<void> {
  try {
    await writer.from('agent_runs').update({ status: patch.status, finished_at: new Date().toISOString(), duration_ms: patch.durationMs, findings_count: patch.findingsCount, alerts_count: patch.alertsCount, error: patch.error ?? null }).eq('id', runId);
  } catch { /* best-effort */ }
}

export async function insertActions(writer: SupabaseClient, runId: string, agentKey: string, actions: string[]): Promise<void> {
  if (actions.length === 0) return;
  try { await writer.from('agent_actions').insert(actions.map((a) => ({ run_id: runId, agent_key: agentKey, action: a }))); } catch { /* best-effort */ }
}

export async function insertResults(writer: SupabaseClient, runId: string, agentKey: string, findings: Finding[]): Promise<void> {
  if (findings.length === 0) return;
  try {
    const rows = findings.slice(0, 200).map((f) => ({ run_id: runId, agent_key: agentKey, finding: f.finding, severity: f.severity, category: f.category, evidence: f.evidence, source: f.source }));
    await writer.from('agent_results').insert(rows);
  } catch { /* best-effort */ }
}

export async function insertAlertDal(writer: SupabaseClient, agentKey: string, runId: string | null, alertType: AgentAlertType, severity: NotificationSeverity, reason: string, evidence: Record<string, unknown>): Promise<string | null> {
  try {
    const { data, error } = await writer.from('agent_alerts').insert({ agent_key: agentKey, run_id: runId, alert_type: alertType, severity, reason, evidence }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}
export async function linkAlertNotification(writer: SupabaseClient, alertId: string, notificationId: string): Promise<void> {
  try { await writer.from('agent_alerts').update({ notification_id: notificationId }).eq('id', alertId); } catch { /* best-effort */ }
}

/** Recompute metrics from this agent's run history. */
export async function updateMetrics(writer: SupabaseClient, agentKey: string): Promise<void> {
  try {
    const { data } = await writer.from('agent_runs').select('status, duration_ms, started_at').eq('agent_key', agentKey).order('started_at', { ascending: false }).limit(500);
    const runs = (data ?? []) as Array<{ status: string; duration_ms: number | null; started_at: string }>;
    const total = runs.length;
    const successes = runs.filter((r) => r.status === 'succeeded').length;
    const failures = runs.filter((r) => r.status === 'failed').length;
    const durations = runs.map((r) => r.duration_ms).filter((n): n is number => typeof n === 'number');
    const avg = durations.length ? Math.round(durations.reduce((a, x) => a + x, 0) / durations.length) : null;
    await writer.from('agent_metrics').upsert({
      agent_key: agentKey, total_runs: total, successes, failures, avg_duration_ms: avg,
      last_status: runs[0]?.status ?? null, last_run_at: runs[0]?.started_at ?? null,
      success_rate: successRate(successes, total), updated_at: new Date().toISOString(),
    }, { onConflict: 'agent_key' });
  } catch { /* best-effort */ }
}

// ---- reads ------------------------------------------------------------------

function mapRun(r: Record<string, unknown>): AgentRun {
  return {
    id: r.id as string, agentKey: r.agent_key as string, status: r.status as RunStatus, trigger: r.trigger as RunTrigger,
    startedAt: r.started_at as string, finishedAt: (r.finished_at as string) ?? null, durationMs: (r.duration_ms as number) ?? null,
    findingsCount: (r.findings_count as number) ?? 0, alertsCount: (r.alerts_count as number) ?? 0, error: (r.error as string) ?? null,
  };
}
export async function getRunsDal(db: SupabaseClient, agentKey: string | null, limit = 50): Promise<AgentRun[]> {
  try {
    let q = db.from('agent_runs').select('id, agent_key, status, trigger, started_at, finished_at, duration_ms, findings_count, alerts_count, error');
    if (agentKey) q = q.eq('agent_key', agentKey);
    const { data } = await q.order('started_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapRun);
  } catch { return []; }
}

export async function listMetricsDal(db: SupabaseClient): Promise<Map<string, AgentMetrics>> {
  const map = new Map<string, AgentMetrics>();
  try {
    const { data } = await db.from('agent_metrics').select('agent_key, total_runs, successes, failures, avg_duration_ms, last_status, last_run_at, success_rate');
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      map.set(r.agent_key as string, {
        agentKey: r.agent_key as string, totalRuns: (r.total_runs as number) ?? 0, successes: (r.successes as number) ?? 0,
        failures: (r.failures as number) ?? 0, avgDurationMs: (r.avg_duration_ms as number) ?? null,
        lastStatus: (r.last_status as string) ?? null, lastRunAt: (r.last_run_at as string) ?? null, successRate: (r.success_rate as number) ?? 0,
      });
    }
  } catch { /* ignore */ }
  return map;
}

export async function getResultsDal(db: SupabaseClient, agentKey: string, limit = 60): Promise<AgentResultRow[]> {
  try {
    const { data } = await db.from('agent_results').select('id, agent_key, finding, severity, category, source, created_at').eq('agent_key', agentKey).order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, agentKey: r.agent_key as string, finding: r.finding as string, severity: r.severity as Finding['severity'], category: (r.category as string) ?? null, source: (r.source as string) ?? null, createdAt: r.created_at as string }));
  } catch { return []; }
}

export interface AgentAlertRow { id: string; agentKey: string; alertType: string; severity: string; reason: string | null; createdAt: string; createdLabel: string; notificationId: string | null }
export async function getAlertsDal(db: SupabaseClient, agentKey: string | null, limit = 50): Promise<AgentAlertRow[]> {
  try {
    let q = db.from('agent_alerts').select('id, agent_key, alert_type, severity, reason, created_at, notification_id');
    if (agentKey) q = q.eq('agent_key', agentKey);
    const { data } = await q.order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, agentKey: r.agent_key as string, alertType: r.alert_type as string, severity: r.severity as string, reason: (r.reason as string) ?? null, createdAt: r.created_at as string, createdLabel: fmt(r.created_at as string), notificationId: (r.notification_id as string) ?? null }));
  } catch { return []; }
}

export async function cancelQueuedJobs(writer: SupabaseClient, agentKey: string): Promise<void> {
  try { await writer.from('agent_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('agent_key', agentKey).eq('status', 'queued'); } catch { /* best-effort */ }
}

// ---- notifications ----------------------------------------------------------

export async function listAdminUserIds(writer: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const { data } = await writer.from('user_roles').select('user_id, roles(name)').limit(5000);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const rel = row.roles;
      const names: string[] = Array.isArray(rel) ? rel.map((r) => String((r as { name?: unknown }).name ?? '').toLowerCase()) : rel && typeof rel === 'object' ? [String((rel as { name?: unknown }).name ?? '').toLowerCase()] : [];
      if (names.includes('admin') && typeof row.user_id === 'string') ids.add(row.user_id);
    }
  } catch { /* ignore */ }
  return Array.from(ids);
}

export async function emitNotification(writer: SupabaseClient, recipientId: string, actorId: string | null, severity: NotificationSeverity, title: string, body: string, metadata: Record<string, unknown>): Promise<string | null> {
  try {
    const prefs = await getPreferencesDal(writer, recipientId);
    if (!shouldDeliver(prefs, 'SYSTEM_ALERT', severity)) return null;
    const r = await insertNotificationDal(writer, { userId: recipientId, type: 'SYSTEM_ALERT', severity, title, body, link: '/dashboard/agents', entityType: 'agent', metadata }, actorId ?? recipientId);
    return r.ok ? r.data.id : null;
  } catch { return null; }
}

export { fail };
