'use server';

// =============================================================================
// HSI Phase 30 — lineage DAL. Reads the materialized link tables + outcome events
// and feeds the pure @hsi/lineage engine for traceability views, plus reviewer+
// link actions and admin graph health/validation. Lineage is traceability only —
// it never changes RBAC. Offline → deterministic demo from @hsi/lineage.
// =============================================================================

import {
  getSignalLineage, getInvestigationLineage, getPublicationLineage,
  validateLineage, computeGraphHealth, demoEdges,
  type Lineage, type LineageEdge, type LineageNode, type GraphHealth,
} from '@hsi/lineage';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { requireAdmin, supabaseConfigured, adminFail, type DbResult } from '@/lib/admin/guard';
import { contributorConfigured, type ContribResult } from './options';

const N = (kind: LineageNode['kind'], id: string): LineageNode => ({ kind, id });

/** Load all materialized lineage edges from the link tables + outcome events. */
async function loadEdges(db: ReturnType<typeof createClient>): Promise<LineageEdge[]> {
  const edges: LineageEdge[] = [];
  const push = async (table: string, build: (r: Record<string, unknown>) => LineageEdge) => {
    try { const { data } = await db.from(table).select('*').limit(20000); for (const r of (data ?? []) as Array<Record<string, unknown>>) edges.push(build(r)); } catch { /* table optional */ }
  };
  await push('investigation_signals', (r) => ({ from: N('signal', String(r.signal_id)), to: N('investigation', String(r.investigation_id)), relation: 'signal_to_investigation' }));
  await push('investigation_publications', (r) => ({ from: N('investigation', String(r.investigation_id)), to: N('publication', String(r.publication_id)), relation: 'investigation_to_publication' }));
  await push('investigation_evidence', (r) => ({ from: N('investigation', String(r.investigation_id)), to: N('evidence', String(r.evidence_id)), relation: 'investigation_to_evidence' }));
  await push('publication_evidence', (r) => ({ from: N('publication', String(r.publication_id)), to: N('evidence', String(r.evidence_id)), relation: 'publication_to_evidence' }));
  await push('outcome_events', (r) => ({ from: N(String(r.entity_kind) as LineageNode['kind'], String(r.entity_id)), to: N('outcome', String(r.id)), relation: String(r.entity_kind) === 'publication' ? 'publication_to_outcome' : 'investigation_to_outcome' }));
  return edges;
}

async function gateResearcher(): Promise<{ ok: true; db: ReturnType<typeof createClient> } | { ok: false; code: 'AUTH_REQUIRED' | 'FORBIDDEN' }> {
  const user = await getUser();
  if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
  const db = createClient();
  const role = await loadHighestRole(db, user.id);
  if (!hasRole(role ?? undefined, 'researcher')) return { ok: false, code: 'FORBIDDEN' };
  return { ok: true, db };
}

/** Signal lineage (Deliverable 6/15). */
export async function getSignalLineageAction(signalId: string): Promise<ContribResult<Lineage>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: getSignalLineage(demoEdges, signalId === 'demo' ? 's1' : signalId) };
  const gate = await gateResearcher();
  if (!gate.ok) return gate;
  try { return { ok: true, data: getSignalLineage(await loadEdges(gate.db), signalId) }; } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Investigation lineage (Deliverable 7). */
export async function getInvestigationLineageAction(id: string): Promise<ContribResult<Lineage>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: getInvestigationLineage(demoEdges, 'i1') };
  const gate = await gateResearcher();
  if (!gate.ok) return gate;
  try { return { ok: true, data: getInvestigationLineage(await loadEdges(gate.db), id) }; } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** Publication lineage (Deliverable 8/14). */
export async function getPublicationLineageAction(id: string): Promise<ContribResult<Lineage>> {
  if (!contributorConfigured()) return { ok: true, demo: true, data: getPublicationLineage(demoEdges, 'p1') };
  const gate = await gateResearcher();
  if (!gate.ok) return gate;
  try { return { ok: true, data: getPublicationLineage(await loadEdges(gate.db), id) }; } catch { return { ok: false, code: 'DB_ERROR' }; }
}

export interface LineageOverview { health: GraphHealth; brokenChains: Array<{ kind: string; id: string; reason: string }>; orphans: Array<{ kind: string; id: string }> }

/** Graph explorer / health data (Deliverables 17/24). */
export async function getLineageOverviewAction(): Promise<ContribResult<LineageOverview>> {
  if (!contributorConfigured()) {
    const v = validateLineage(demoEdges);
    return { ok: true, demo: true, data: { health: computeGraphHealth(demoEdges), brokenChains: v.brokenChains.map((b) => ({ kind: b.node.kind, id: b.node.id, reason: b.reason })), orphans: v.orphans.map((o) => ({ kind: o.kind, id: o.id })) } };
  }
  const gate = await gateResearcher();
  if (!gate.ok) return gate;
  try {
    const edges = await loadEdges(gate.db);
    const v = validateLineage(edges);
    return { ok: true, data: { health: computeGraphHealth(edges), brokenChains: v.brokenChains.map((b) => ({ kind: b.node.kind, id: b.node.id, reason: b.reason })), orphans: v.orphans.map((o) => ({ kind: o.kind, id: o.id })) } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}

/** ADMIN: latest stored graph-health snapshot (Deliverable 24). */
export async function getGraphHealthAction(): Promise<DbResult<GraphHealth | null> & { demo?: boolean }> {
  if (!supabaseConfigured()) return { ok: true, data: computeGraphHealth(demoEdges), demo: true };
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const { data } = await gate.ctx.db.from('graph_health').select('*').order('computed_at', { ascending: false }).limit(1).maybeSingle();
    if (!data) return { ok: true, data: null };
    const r = data as Record<string, number>;
    return { ok: true, data: {
      nodeCount: Number(r.node_count ?? 0), edgeCount: Number(r.edge_count ?? 0), orphanCount: Number(r.orphan_count ?? 0),
      brokenChainCount: Number(r.broken_chain_count ?? 0), cycleCount: Number(r.cycle_count ?? 0),
      chainCompleteness: Number(r.chain_completeness ?? 0), averageTraceDepth: Number(r.average_trace_depth ?? 0),
      coverage: Number(r.coverage ?? 0), healthScore: Number(r.health_score ?? 0),
    } };
  } catch (e) { return adminFail(e); }
}

// ---- reviewer+ link actions (materialize lineage) -------------------------
async function insertLink(table: string, row: Record<string, string>): Promise<ContribResult<{ ok: true }>> {
  if (!contributorConfigured()) return { ok: false, code: 'NOT_CONFIGURED' };
  try {
    const user = await getUser();
    if (!user) return { ok: false, code: 'AUTH_REQUIRED' };
    const db = createClient();
    const role = await loadHighestRole(db, user.id);
    if (!hasRole(role ?? undefined, 'reviewer')) return { ok: false, code: 'FORBIDDEN' };
    const { error } = await db.from(table).insert({ ...row, created_by: user.id });
    if (error && !/duplicate key/i.test(error.message)) return { ok: false, code: 'DB_ERROR', error: error.message };
    return { ok: true, data: { ok: true } };
  } catch { return { ok: false, code: 'DB_ERROR' }; }
}
export async function linkSignalToInvestigationAction(signalId: string, investigationId: string) { return insertLink('investigation_signals', { signal_id: signalId, investigation_id: investigationId }); }
export async function linkInvestigationToPublicationAction(investigationId: string, publicationId: string) { return insertLink('investigation_publications', { investigation_id: investigationId, publication_id: publicationId }); }
export async function linkInvestigationToEvidenceAction(investigationId: string, evidenceId: string) { return insertLink('investigation_evidence', { investigation_id: investigationId, evidence_id: evidenceId }); }
export async function linkPublicationToEvidenceAction(publicationId: string, evidenceId: string) { return insertLink('publication_evidence', { publication_id: publicationId, evidence_id: evidenceId }); }
