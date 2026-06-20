// =============================================================================
// HSI Phase 70.1 — Infrastructure DAL (SERVER-ONLY). Records + reads the ops
// ledgers (backups / deployments / events / uptime / incidents) and computes
// operational metrics from real counts. Admin-gated by RLS. Never throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BackupRecord, DeploymentRecord, InfraEventRecord, UptimeCheck, IncidentRecord, OperationalMetrics,
} from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };
function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}
type CountQuery = PromiseLike<{ count: number | null }>;
async function countRows(make: () => CountQuery): Promise<number> { try { const { count } = await make(); return count ?? 0; } catch { return 0; } }

// ---- backups ----------------------------------------------------------------

export async function recordBackupDal(db: SupabaseClient, input: { status?: string; kind?: string; sizeBytes?: number | null; note?: string }, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('infra_backups').insert({ status: input.status ?? 'success', kind: input.kind ?? 'full', size_bytes: input.sizeBytes ?? null, note: input.note ?? null, recorded_by: actorId }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function markRestoreTestedDal(db: SupabaseClient, id: string): Promise<DbResult<{ id: string }>> {
  try { const { error } = await db.from('infra_backups').update({ restore_tested: true, restore_tested_at: new Date().toISOString() }).eq('id', id); if (error) return fail(error); return { ok: true, data: { id } }; } catch (e) { return fail(e); }
}

export async function listBackupsDal(db: SupabaseClient, limit = 20): Promise<BackupRecord[]> {
  try {
    const { data } = await db.from('infra_backups').select('id, backed_up_at, status, kind, size_bytes, restore_tested, restore_tested_at, note').order('backed_up_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, backedUpAt: r.backed_up_at as string, status: r.status as string, kind: r.kind as string, sizeBytes: (r.size_bytes as number) ?? null, restoreTested: (r.restore_tested as boolean) ?? false, restoreTestedAt: (r.restore_tested_at as string) ?? null, note: (r.note as string) ?? null }));
  } catch { return []; }
}

// ---- deployments ------------------------------------------------------------

export async function recordDeploymentDal(db: SupabaseClient, input: { version?: string; commitSha?: string; environment?: string; status?: string; note?: string }, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('infra_deployments').insert({ version: input.version ?? null, commit_sha: input.commitSha ?? null, environment: input.environment ?? 'production', status: input.status ?? 'success', note: input.note ?? null, recorded_by: actorId }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function listDeploymentsDal(db: SupabaseClient, limit = 20): Promise<DeploymentRecord[]> {
  try {
    const { data } = await db.from('infra_deployments').select('id, version, commit_sha, environment, status, deployed_at, note').order('deployed_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, version: (r.version as string) ?? null, commitSha: (r.commit_sha as string) ?? null, environment: r.environment as string, status: r.status as string, deployedAt: r.deployed_at as string, note: (r.note as string) ?? null }));
  } catch { return []; }
}

// ---- infra events -----------------------------------------------------------

export async function recordInfraEventDal(db: SupabaseClient, input: { category: string; eventType: string; severity?: string; detail?: string; metadata?: Record<string, unknown>; actorId?: string | null }): Promise<void> {
  try { await db.from('infra_events').insert({ category: input.category, event_type: input.eventType, severity: input.severity ?? 'info', detail: input.detail ?? null, metadata: input.metadata ?? {}, actor_id: input.actorId ?? null }); } catch { /* best-effort */ }
}

export async function listInfraEventsDal(db: SupabaseClient, limit = 50): Promise<InfraEventRecord[]> {
  try {
    const { data } = await db.from('infra_events').select('id, category, event_type, severity, detail, created_at').order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, category: r.category as string, eventType: r.event_type as string, severity: r.severity as string, detail: (r.detail as string) ?? null, createdAt: r.created_at as string }));
  } catch { return []; }
}

// ---- uptime + incidents -----------------------------------------------------

export async function recordUptimeCheckDal(db: SupabaseClient, input: { endpoint: string; ok: boolean; statusCode: number | null; latencyMs: number | null }): Promise<void> {
  try { await db.from('infra_uptime_checks').insert({ endpoint: input.endpoint, ok: input.ok, status_code: input.statusCode, latency_ms: input.latencyMs }); } catch { /* best-effort */ }
}

export async function recentUptimeDal(db: SupabaseClient, limit = 500): Promise<UptimeCheck[]> {
  try {
    const { data } = await db.from('infra_uptime_checks').select('endpoint, ok, status_code, latency_ms, checked_at').order('checked_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ endpoint: r.endpoint as string, ok: (r.ok as boolean) ?? false, statusCode: (r.status_code as number) ?? null, latencyMs: (r.latency_ms as number) ?? null, checkedAt: r.checked_at as string }));
  } catch { return []; }
}

export async function openIncidentDal(db: SupabaseClient, endpoint: string, severity: string, detail: string): Promise<void> {
  try {
    const { data } = await db.from('infra_incidents').select('id').eq('endpoint', endpoint).eq('status', 'open').limit(1);
    if ((data ?? []).length > 0) return; // already open
    await db.from('infra_incidents').insert({ endpoint, status: 'open', severity, detail });
  } catch { /* best-effort */ }
}

export async function resolveIncidentsDal(db: SupabaseClient, endpoint: string): Promise<void> {
  try { await db.from('infra_incidents').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('endpoint', endpoint).eq('status', 'open'); } catch { /* best-effort */ }
}

export async function listIncidentsDal(db: SupabaseClient, limit = 30): Promise<IncidentRecord[]> {
  try {
    const { data } = await db.from('infra_incidents').select('id, endpoint, status, severity, detail, started_at, resolved_at').order('started_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, endpoint: r.endpoint as string, status: r.status as string, severity: r.severity as string, detail: (r.detail as string) ?? null, startedAt: r.started_at as string, resolvedAt: (r.resolved_at as string) ?? null }));
  } catch { return []; }
}

// ---- operational metrics (real counts) -------------------------------------

export async function operationalMetricsDal(c: SupabaseClient): Promise<OperationalMetrics> {
  const head = (table: string) => c.from(table).select('id', { count: 'exact', head: true }) as unknown as CountQuery;
  const [sources, signals, evidence, narratives, forecasts, products, notifications, agents] = await Promise.all([
    countRows(() => head('hsin_sources')),
    countRows(() => head('hsin_signals')),
    countRows(() => head('hsin_evidence_claims')),
    countRows(() => head('narratives')),
    countRows(() => head('forecasts')),
    countRows(() => head('marketplace_products')),
    countRows(() => head('notifications')),
    countRows(() => head('agents')),
  ]);
  return { sources, signals, evidence, narratives, forecasts, marketplaceProducts: products, notifications, agents };
}

export { fail };
