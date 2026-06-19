// =============================================================================
// HSI Phase 63 — Source Monitoring DAL (SERVER-ONLY).
//
// Reads the prior monitoring snapshot + alert/event history, persists new state /
// transitions / alerts, and emits notifications THROUGH the Phase 62 framework
// (its DAL + delivery gating) — no Phase 62 code is modified. Reads on the
// dashboard use the reviewer's RLS client; the monitoring run uses an admin or
// service-role client. Never throws; degrades to empty/zero.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotificationDal, getPreferencesDal } from '@/lib/notifications/persistence';
import { shouldDeliver, type NotificationType, type NotificationSeverity } from '@/lib/notifications/types';
import type { PriorState, Classification, MonitoringAlert, SourceState } from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

export interface AlertRow {
  id: string; sourceId: string; sourceName: string; sourceType: string | null;
  kind: string; severity: string; state: string | null; reason: string | null;
  scoreBefore: number | null; scoreAfter: number | null; createdAt: string; createdLabel: string;
  notificationId: string | null;
}
export interface EventRow {
  id: string; sourceId: string; sourceName: string | null; fromState: string | null;
  toState: string; kind: string | null; reason: string | null; score: number | null; createdAt: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}

/** Prior per-source monitoring snapshots, keyed by source_id. */
export async function readPriorStates(db: SupabaseClient): Promise<Map<string, PriorState>> {
  const map = new Map<string, PriorState>();
  try {
    const { data } = await db.from('source_monitoring_state').select('source_id, state, score, last_success_at, last_failure_at, updated_at').limit(5000);
    for (const r of (data ?? []) as Array<{ source_id: string; state: string; score: number | null; last_success_at: string | null; last_failure_at: string | null; updated_at: string | null }>) {
      map.set(r.source_id, { state: r.state as SourceState, score: r.score, lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at, updatedAt: r.updated_at });
    }
  } catch { /* cold start / unavailable */ }
  return map;
}

export async function upsertState(db: SupabaseClient, input: {
  sourceId: string; sourceName: string; sourceType: string; cls: Classification; prevScore: number | null; daysStale: number | null; nowIso: string;
}): Promise<void> {
  try {
    await db.from('source_monitoring_state').upsert({
      source_id: input.sourceId,
      source_name: input.sourceName,
      source_type: input.sourceType,
      state: input.cls.state,
      reason: input.cls.reason,
      score: input.cls.score,
      prev_score: input.prevScore,
      last_success_at: input.cls.lastSuccess,
      last_failure_at: input.cls.lastFailure,
      days_stale: input.daysStale,
      evidence: input.cls.evidence,
      evaluated_at: input.nowIso,
      updated_at: input.nowIso,
    }, { onConflict: 'source_id' });
  } catch { /* best-effort */ }
}

export async function insertEvent(db: SupabaseClient, input: {
  sourceId: string; sourceName: string; fromState: string | null; toState: string; kind: string; reason: string; score: number; evidence: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.from('source_monitoring_events').insert({
      source_id: input.sourceId, source_name: input.sourceName, from_state: input.fromState,
      to_state: input.toState, kind: input.kind, reason: input.reason, score: input.score, evidence: input.evidence,
    });
  } catch { /* best-effort */ }
}

export async function insertAlert(db: SupabaseClient, a: MonitoringAlert): Promise<string | null> {
  try {
    const { data, error } = await db.from('source_monitoring_alerts').insert({
      source_id: a.sourceId, source_name: a.sourceName, source_type: a.sourceType, kind: a.kind,
      severity: a.severity, state: a.state, reason: a.reason, evidence: a.evidence,
      score_before: a.scoreBefore, score_after: a.scoreAfter,
      last_success_at: a.lastSuccess, last_failure_at: a.lastFailure,
    }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}

export async function linkAlertNotification(db: SupabaseClient, alertId: string, notificationId: string): Promise<void> {
  try { await db.from('source_monitoring_alerts').update({ notification_id: notificationId }).eq('id', alertId); } catch { /* best-effort */ }
}

/** Resolve admin recipient user ids (service-role or admin client). */
export async function listAdminUserIds(db: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();
  try {
    const { data } = await db.from('user_roles').select('user_id, roles(name)').limit(5000);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const rel = row.roles;
      const names: string[] = Array.isArray(rel)
        ? rel.map((r) => String((r as { name?: unknown }).name ?? '').toLowerCase())
        : rel && typeof rel === 'object' ? [String((rel as { name?: unknown }).name ?? '').toLowerCase()] : [];
      if (names.includes('admin') && typeof row.user_id === 'string') ids.add(row.user_id);
    }
  } catch { /* ignore */ }
  return Array.from(ids);
}

/** Emit a notification to one recipient via the Phase 62 DAL + delivery gating. */
export async function emitNotification(db: SupabaseClient, recipientId: string, actorId: string | null, input: {
  type: NotificationType; severity: NotificationSeverity; title: string; body?: string; link?: string; entityId?: string; metadata?: Record<string, unknown>;
}): Promise<{ id: string | null; suppressed: boolean }> {
  try {
    const prefs = await getPreferencesDal(db, recipientId);
    if (!shouldDeliver(prefs, input.type, input.severity)) return { id: null, suppressed: true };
    const r = await insertNotificationDal(db, {
      userId: recipientId, type: input.type, severity: input.severity, title: input.title,
      body: input.body ?? null, link: input.link ?? null, entityType: 'source', entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    }, actorId ?? recipientId);
    return { id: r.ok ? r.data.id : null, suppressed: false };
  } catch { return { id: null, suppressed: false }; }
}

// ---- dashboard reads (reviewer+ RLS client) --------------------------------

export async function readRecentAlerts(db: SupabaseClient, limit = 100): Promise<AlertRow[]> {
  try {
    const { data } = await db.from('source_monitoring_alerts')
      .select('id, source_id, source_name, source_type, kind, severity, state, reason, score_before, score_after, created_at, notification_id')
      .order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string, sourceId: r.source_id as string, sourceName: (r.source_name as string) ?? '—',
      sourceType: (r.source_type as string) ?? null, kind: r.kind as string, severity: r.severity as string,
      state: (r.state as string) ?? null, reason: (r.reason as string) ?? null,
      scoreBefore: (r.score_before as number) ?? null, scoreAfter: (r.score_after as number) ?? null,
      createdAt: r.created_at as string, createdLabel: fmt(r.created_at as string), notificationId: (r.notification_id as string) ?? null,
    }));
  } catch { return []; }
}

export async function readRecentEvents(db: SupabaseClient, limit = 200): Promise<EventRow[]> {
  try {
    const { data } = await db.from('source_monitoring_events')
      .select('id, source_id, source_name, from_state, to_state, kind, reason, score, created_at')
      .order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string, sourceId: r.source_id as string, sourceName: (r.source_name as string) ?? null,
      fromState: (r.from_state as string) ?? null, toState: r.to_state as string, kind: (r.kind as string) ?? null,
      reason: (r.reason as string) ?? null, score: (r.score as number) ?? null, createdAt: r.created_at as string,
    }));
  } catch { return []; }
}

/** Per-source score history (oldest→newest) from the event log, for trend analysis. */
export async function readScoreHistory(db: SupabaseClient, sourceId: string, limit = 12): Promise<number[]> {
  try {
    const { data } = await db.from('source_monitoring_events')
      .select('score, created_at').eq('source_id', sourceId).order('created_at', { ascending: false }).limit(limit);
    const scores = ((data ?? []) as Array<{ score: number | null }>).map((r) => r.score).filter((n): n is number => typeof n === 'number');
    return scores.reverse();
  } catch { return []; }
}

export { fail };
