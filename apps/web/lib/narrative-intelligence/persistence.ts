// =============================================================================
// HSI Phase 65 — Narrative Intelligence DAL (SERVER-ONLY).
//
// Reads/writes narrative tables through the caller's RLS client (reviewer+ read,
// admin manage). Member labels are resolved from graph_nodes. Reuses the Phase 62
// notification DAL for alert delivery. Never throws; degrades to empty.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertNotificationDal, getPreferencesDal } from '@/lib/notifications/persistence';
import { shouldDeliver } from '@/lib/notifications/types';
import {
  type Narrative, type NarrativeMember, type NarrativeSnapshot, type NarrativeHealth,
  type NarrativeAlert, type NarrativeStatus, isNarrativeStatus,
} from './types';
import type { NodeType } from '@/lib/evidence-graph/types';
import type { MemberComposition } from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'narrative';
}

function mapNarrative(r: Record<string, unknown>): Narrative {
  return {
    id: r.id as string, name: (r.name as string) ?? 'Narrative', slug: (r.slug as string) ?? null,
    summary: (r.summary as string) ?? null,
    status: (isNarrativeStatus(r.status) ? r.status : 'emerging') as NarrativeStatus,
    seedNodeId: (r.seed_node_id as string) ?? null, graphNodeId: (r.graph_node_id as string) ?? null,
    createdAt: r.created_at as string, updatedAt: (r.updated_at as string) ?? null,
  };
}
const NARR_COLS = 'id, name, slug, summary, status, seed_node_id, graph_node_id, created_at, updated_at';

// ---- narrative CRUD ---------------------------------------------------------

export async function insertNarrative(writer: SupabaseClient, input: { name: string; slug: string; summary?: string | null; seedNodeId?: string | null; graphNodeId?: string | null; status?: NarrativeStatus }, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await writer.from('narratives').insert({
      name: input.name, slug: input.slug, summary: input.summary ?? null, seed_node_id: input.seedNodeId ?? null,
      graph_node_id: input.graphNodeId ?? null, status: input.status ?? 'emerging', created_by: actorId,
    }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function updateNarrativeDal(db: SupabaseClient, id: string, patch: { name?: string; summary?: string; status?: NarrativeStatus }): Promise<DbResult<{ id: string }>> {
  try {
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.summary !== undefined) upd.summary = patch.summary;
    if (patch.status !== undefined) upd.status = patch.status;
    const { error } = await db.from('narratives').update(upd).eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function setStatus(writer: SupabaseClient, id: string, status: NarrativeStatus): Promise<void> {
  try { await writer.from('narratives').update({ status, updated_at: new Date().toISOString() }).eq('id', id); } catch { /* best-effort */ }
}

export async function getNarrativeDal(db: SupabaseClient, id: string): Promise<Narrative | null> {
  try {
    const { data } = await db.from('narratives').select(NARR_COLS).eq('id', id).maybeSingle();
    return data ? mapNarrative(data as Record<string, unknown>) : null;
  } catch { return null; }
}

export async function listNarrativesDal(db: SupabaseClient, opts: { status?: NarrativeStatus; limit?: number } = {}): Promise<Narrative[]> {
  try {
    let q = db.from('narratives').select(NARR_COLS);
    if (opts.status) q = q.eq('status', opts.status);
    const { data } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 200);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapNarrative);
  } catch { return []; }
}

export async function searchNarrativesDal(db: SupabaseClient, q: string, limit = 25): Promise<Narrative[]> {
  try {
    let query = db.from('narratives').select(NARR_COLS);
    if (q.trim()) query = query.ilike('name', `%${q.trim()}%`);
    const { data } = await query.order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapNarrative);
  } catch { return []; }
}

// ---- members (replace on recompute) ----------------------------------------

export async function replaceMembers(writer: SupabaseClient, narrativeId: string, members: NarrativeMember[]): Promise<void> {
  try {
    await writer.from('narrative_members').delete().eq('narrative_id', narrativeId);
    await writer.from('narrative_claims').delete().eq('narrative_id', narrativeId);
    await writer.from('narrative_sources').delete().eq('narrative_id', narrativeId);
    if (members.length === 0) return;
    const memberRows = members.map((m) => ({ narrative_id: narrativeId, node_id: m.nodeId, member_type: m.memberType, reason: m.reason, confidence: m.confidence, depth: m.depth }));
    for (let i = 0; i < memberRows.length; i += 500) await writer.from('narrative_members').insert(memberRows.slice(i, i + 500)).then(() => undefined, () => undefined);
    const claimRows = members.filter((m) => m.memberType === 'EVIDENCE' || m.memberType === 'CLAIM').map((m) => ({ narrative_id: narrativeId, node_id: m.nodeId, stance: m.stance ?? 'neutral', confidence: m.confidence }));
    if (claimRows.length) await writer.from('narrative_claims').insert(claimRows).then(() => undefined, () => undefined);
    const sourceRows = members.filter((m) => m.memberType === 'SOURCE').map((m) => ({ narrative_id: narrativeId, node_id: m.nodeId }));
    if (sourceRows.length) await writer.from('narrative_sources').insert(sourceRows).then(() => undefined, () => undefined);
  } catch { /* best-effort */ }
}

export async function getMembersDal(db: SupabaseClient, narrativeId: string, limit = 500): Promise<NarrativeMember[]> {
  try {
    const { data } = await db.from('narrative_members').select('node_id, member_type, reason, confidence, depth').eq('narrative_id', narrativeId).order('depth', { ascending: true }).limit(limit);
    const rows = (data ?? []) as Array<{ node_id: string; member_type: string; reason: string | null; confidence: number | null; depth: number | null }>;
    if (rows.length === 0) return [];
    // labels from graph_nodes; stance from narrative_claims
    const ids = rows.map((r) => r.node_id);
    const labelById = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: nodes } = await db.from('graph_nodes').select('id, label').in('id', ids.slice(i, i + 300));
      for (const nrow of (nodes ?? []) as Array<{ id: string; label: string | null }>) labelById.set(nrow.id, nrow.label ?? nrow.id);
    }
    const stanceById = new Map<string, string>();
    const { data: claims } = await db.from('narrative_claims').select('node_id, stance').eq('narrative_id', narrativeId).limit(limit);
    for (const cr of (claims ?? []) as Array<{ node_id: string; stance: string }>) stanceById.set(cr.node_id, cr.stance);
    return rows.map((r) => ({
      nodeId: r.node_id, memberType: r.member_type as NodeType, label: labelById.get(r.node_id) ?? r.node_id,
      reason: r.reason ?? 'graph adjacency', confidence: r.confidence ?? 1, depth: r.depth ?? 0,
      stance: (stanceById.get(r.node_id) as NarrativeMember['stance']) ?? undefined,
    }));
  } catch { return []; }
}

/** All memberships (narrative_id, node_id) for narrative-to-narrative overlap. */
export async function readAllMemberships(db: SupabaseClient, limit = 20000): Promise<Array<{ narrativeId: string; nodeId: string; memberType: string }>> {
  try {
    const { data } = await db.from('narrative_members').select('narrative_id, node_id, member_type').limit(limit);
    return ((data ?? []) as Array<{ narrative_id: string; node_id: string; member_type: string }>).map((r) => ({ narrativeId: r.narrative_id, nodeId: r.node_id, memberType: r.member_type }));
  } catch { return []; }
}

// ---- snapshots / metrics / events ------------------------------------------

export async function insertSnapshot(writer: SupabaseClient, narrativeId: string, s: NarrativeSnapshot): Promise<void> {
  try {
    await writer.from('narrative_snapshots').insert({
      narrative_id: narrativeId, member_count: s.memberCount, signal_count: s.signalCount, evidence_count: s.evidenceCount,
      source_count: s.sourceCount, actor_count: s.actorCount, contradiction_ratio: s.contradictionRatio, stability_score: s.stabilityScore,
    });
  } catch { /* best-effort */ }
}

function mapSnapshot(r: Record<string, unknown>): NarrativeSnapshot {
  return {
    memberCount: (r.member_count as number) ?? 0, signalCount: (r.signal_count as number) ?? 0,
    evidenceCount: (r.evidence_count as number) ?? 0, sourceCount: (r.source_count as number) ?? 0,
    actorCount: (r.actor_count as number) ?? 0, contradictionRatio: (r.contradiction_ratio as number) ?? 0,
    stabilityScore: (r.stability_score as number) ?? 0, snapshotAt: r.snapshot_at as string,
  };
}

export async function getSnapshotsDal(db: SupabaseClient, narrativeId: string, limit = 60): Promise<NarrativeSnapshot[]> {
  try {
    const { data } = await db.from('narrative_snapshots').select('member_count, signal_count, evidence_count, source_count, actor_count, contradiction_ratio, stability_score, snapshot_at').eq('narrative_id', narrativeId).order('snapshot_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapSnapshot);
  } catch { return []; }
}

export async function insertMetrics(writer: SupabaseClient, narrativeId: string, memberCount: number, h: NarrativeHealth): Promise<void> {
  try {
    await writer.from('narrative_metrics').insert({
      narrative_id: narrativeId, member_count: memberCount, coverage: h.coverage, source_diversity: h.sourceDiversity,
      evidence_density: h.evidenceDensity, claim_density: h.claimDensity, actor_diversity: h.actorDiversity,
      contradiction_ratio: h.contradictionRatio, stability_score: h.stabilityScore,
    });
  } catch { /* best-effort */ }
}

export interface MetricsRow { narrativeId: string; memberCount: number; stability: number; contradiction: number; sourceDiversity: number; evidenceDensity: number }

export async function latestMetricsByNarrative(db: SupabaseClient): Promise<Map<string, MetricsRow>> {
  const map = new Map<string, MetricsRow>();
  try {
    const { data } = await db.from('narrative_metrics').select('narrative_id, member_count, stability_score, contradiction_ratio, source_diversity, evidence_density, computed_at').order('computed_at', { ascending: false }).limit(5000);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const nid = r.narrative_id as string;
      if (map.has(nid)) continue; // first = latest (desc order)
      map.set(nid, { narrativeId: nid, memberCount: (r.member_count as number) ?? 0, stability: (r.stability_score as number) ?? 0, contradiction: (r.contradiction_ratio as number) ?? 0, sourceDiversity: (r.source_diversity as number) ?? 0, evidenceDensity: (r.evidence_density as number) ?? 0 });
    }
  } catch { /* ignore */ }
  return map;
}

export async function insertEvent(writer: SupabaseClient, narrativeId: string, eventType: string, detail: string, magnitude?: number): Promise<void> {
  try { await writer.from('narrative_events').insert({ narrative_id: narrativeId, event_type: eventType, detail, magnitude: magnitude ?? null }); } catch { /* best-effort */ }
}

export interface EventRow { eventType: string; detail: string | null; occurredAt: string }
export async function getEventsDal(db: SupabaseClient, narrativeId: string, limit = 40): Promise<EventRow[]> {
  try {
    const { data } = await db.from('narrative_events').select('event_type, detail, occurred_at').eq('narrative_id', narrativeId).order('occurred_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<{ event_type: string; detail: string | null; occurred_at: string }>).map((r) => ({ eventType: r.event_type, detail: r.detail, occurredAt: r.occurred_at }));
  } catch { return []; }
}

// ---- alerts + notifications -------------------------------------------------

export async function insertAlertDal(writer: SupabaseClient, narrativeId: string, a: NarrativeAlert): Promise<string | null> {
  try {
    const { data, error } = await writer.from('narrative_alerts').insert({ narrative_id: narrativeId, alert_type: a.alertType, severity: a.severity, reason: a.reason, evidence: a.evidence }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch { return null; }
}

export async function linkAlertNotification(writer: SupabaseClient, alertId: string, notificationId: string): Promise<void> {
  try { await writer.from('narrative_alerts').update({ notification_id: notificationId }).eq('id', alertId); } catch { /* best-effort */ }
}

export interface AlertFeedRow { id: string; narrativeId: string; alertType: string; severity: string; reason: string | null; createdAt: string; createdLabel: string; notificationId: string | null }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso?: string | null): string { if (!iso) return '—'; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; }

export async function getRecentAlertsDal(db: SupabaseClient, narrativeId: string | null, limit = 50): Promise<AlertFeedRow[]> {
  try {
    let q = db.from('narrative_alerts').select('id, narrative_id, alert_type, severity, reason, created_at, notification_id');
    if (narrativeId) q = q.eq('narrative_id', narrativeId);
    const { data } = await q.order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, narrativeId: r.narrative_id as string, alertType: r.alert_type as string, severity: r.severity as string, reason: (r.reason as string) ?? null, createdAt: r.created_at as string, createdLabel: fmt(r.created_at as string), notificationId: (r.notification_id as string) ?? null }));
  } catch { return []; }
}

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

export async function emitNotification(writer: SupabaseClient, recipientId: string, actorId: string | null, input: { severity: NarrativeAlert['severity']; title: string; body?: string; metadata?: Record<string, unknown> }): Promise<string | null> {
  try {
    const prefs = await getPreferencesDal(writer, recipientId);
    if (!shouldDeliver(prefs, 'SYSTEM_ALERT', input.severity)) return null;
    const r = await insertNotificationDal(writer, { userId: recipientId, type: 'SYSTEM_ALERT', severity: input.severity, title: input.title, body: input.body ?? null, link: '/dashboard/narratives', entityType: 'narrative', metadata: input.metadata ?? {} }, actorId ?? recipientId);
    return r.ok ? r.data.id : null;
  } catch { return null; }
}

// dashboard reads
export async function countByStatusDal(db: SupabaseClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const { data } = await db.from('narratives').select('status').limit(5000);
    for (const r of (data ?? []) as Array<{ status: string }>) out[r.status] = (out[r.status] ?? 0) + 1;
  } catch { /* ignore */ }
  return out;
}

export async function recentlyChangedDal(db: SupabaseClient, limit = 5): Promise<Narrative[]> {
  try {
    const { data } = await db.from('narratives').select(NARR_COLS).order('updated_at', { ascending: false, nullsFirst: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapNarrative);
  } catch { return []; }
}

/** Latest snapshot per narrative (one bounded read). */
export async function latestSnapshotByNarrative(db: SupabaseClient): Promise<Map<string, NarrativeSnapshot>> {
  const map = new Map<string, NarrativeSnapshot>();
  try {
    const { data } = await db.from('narrative_snapshots').select('narrative_id, member_count, signal_count, evidence_count, source_count, actor_count, contradiction_ratio, stability_score, snapshot_at').order('snapshot_at', { ascending: false }).limit(6000);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const nid = r.narrative_id as string;
      if (map.has(nid)) continue;
      map.set(nid, mapSnapshot(r));
    }
  } catch { /* ignore */ }
  return map;
}

/** Relative member growth per narrative from its last two snapshots. */
export async function growthByNarrative(db: SupabaseClient): Promise<Map<string, number>> {
  const seen = new Map<string, number[]>();
  try {
    const { data } = await db.from('narrative_snapshots').select('narrative_id, member_count, snapshot_at').order('snapshot_at', { ascending: false }).limit(8000);
    for (const r of (data ?? []) as Array<{ narrative_id: string; member_count: number }>) {
      const arr = seen.get(r.narrative_id) ?? [];
      if (arr.length < 2) { arr.push(r.member_count ?? 0); seen.set(r.narrative_id, arr); }
    }
  } catch { /* ignore */ }
  const out = new Map<string, number>();
  for (const [nid, [cur, prev]] of seen) {
    if (prev === undefined) { out.set(nid, 0); continue; }
    out.set(nid, prev > 0 ? Math.round(((cur - prev) / prev) * 100) / 100 : (cur > 0 ? 1 : 0));
  }
  return out;
}

export { fail, mapNarrative };
export type { MemberComposition };
