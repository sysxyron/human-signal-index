// =============================================================================
// HSI Phase 64 — Evidence Graph DAL (SERVER-ONLY).
//
// Reads/writes graph_nodes / graph_edges / graph_edge_evidence through the
// caller's RLS client (reviewer+ read, admin manage). Bulk upserts for the
// builder; bounded, paged traversal for queries (large graphs never blow up).
// Never throws; degrades to empty.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type GraphNode, type GraphEdge, type Neighbor, type NodeType, type RelationshipType,
  isNodeType, isRelationshipType, traverse,
} from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

export function nodeKey(type: string, entityId: string): string { return `${type}:${entityId}`; }
function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}
function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const NODE_COLS = 'id, node_type, entity_id, label, status, visibility, metadata, created_at';
const EDGE_COLS = 'id, source_node_id, target_node_id, relationship_type, confidence, provenance, created_at';

function mapNode(r: Record<string, unknown>): GraphNode {
  return {
    id: r.id as string,
    nodeType: (isNodeType(r.node_type) ? r.node_type : 'SOURCE') as NodeType,
    entityId: r.entity_id as string,
    label: (r.label as string) ?? (r.entity_id as string),
    status: (r.status as string) ?? null,
    visibility: ((r.visibility as string) ?? 'internal') as GraphNode['visibility'],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  };
}
function mapEdge(r: Record<string, unknown>): GraphEdge {
  return {
    id: r.id as string,
    sourceNodeId: r.source_node_id as string,
    targetNodeId: r.target_node_id as string,
    relationshipType: (isRelationshipType(r.relationship_type) ? r.relationship_type : 'RELATED_TO') as RelationshipType,
    confidence: typeof r.confidence === 'number' ? r.confidence : 1,
    provenance: (r.provenance as string) ?? null,
    createdAt: r.created_at as string,
  };
}

// ---- builder bulk upserts ---------------------------------------------------

export interface NodeInput { nodeType: NodeType; entityId: string; label: string; status?: string | null; metadata?: Record<string, unknown> }
export interface EdgeInput {
  sourceKey: string; targetKey: string; relationshipType: RelationshipType; confidence: number;
  provenance: string; evidenceKind: string; evidenceRef?: string | null;
}

/** Upsert nodes (dedup on node_type+entity_id). Returns key→id map. */
export async function upsertNodes(writer: SupabaseClient, nodes: NodeInput[], actorId: string | null): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batch of chunk(nodes, 500)) {
    try {
      const rows = batch.map((n) => ({
        node_type: n.nodeType, entity_id: n.entityId, label: n.label, status: n.status ?? null,
        metadata: n.metadata ?? {}, created_by: actorId, updated_at: new Date().toISOString(),
      }));
      const { data } = await writer.from('graph_nodes').upsert(rows, { onConflict: 'node_type,entity_id' }).select('id, node_type, entity_id');
      for (const r of (data ?? []) as Array<{ id: string; node_type: string; entity_id: string }>) {
        map.set(nodeKey(r.node_type, r.entity_id), r.id);
      }
    } catch { /* best-effort */ }
  }
  return map;
}

/** Upsert edges by node-key (dedup on source+target+relationship). Records provenance. */
export async function upsertEdges(writer: SupabaseClient, edges: EdgeInput[], keyToId: Map<string, string>, actorId: string | null): Promise<number> {
  let written = 0;
  const resolved = edges
    .map((e) => ({ e, src: keyToId.get(e.sourceKey), tgt: keyToId.get(e.targetKey) }))
    .filter((x): x is { e: EdgeInput; src: string; tgt: string } => !!x.src && !!x.tgt && x.src !== x.tgt);

  for (const batch of chunk(resolved, 500)) {
    try {
      const rows = batch.map(({ e, src, tgt }) => ({
        source_node_id: src, target_node_id: tgt, relationship_type: e.relationshipType,
        confidence: e.confidence, provenance: e.provenance, evidence_summary: e.provenance,
        created_by: actorId, updated_at: new Date().toISOString(),
      }));
      const { data } = await writer.from('graph_edges').upsert(rows, { onConflict: 'source_node_id,target_node_id,relationship_type' }).select('id, source_node_id, target_node_id, relationship_type');
      const idByTriple = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ id: string; source_node_id: string; target_node_id: string; relationship_type: string }>) {
        idByTriple.set(`${r.source_node_id}|${r.target_node_id}|${r.relationship_type}`, r.id);
        written += 1;
      }
      // provenance rows (best-effort)
      const evRows = batch
        .map(({ e, src, tgt }) => ({ edge_id: idByTriple.get(`${src}|${tgt}|${e.relationshipType}`), evidence_kind: e.evidenceKind, evidence_ref: e.evidenceRef ?? null, note: e.provenance }))
        .filter((r) => r.edge_id);
      if (evRows.length) await writer.from('graph_edge_evidence').insert(evRows).then(() => undefined, () => undefined);
    } catch { /* best-effort */ }
  }
  return written;
}

// ---- single CRUD (service API) ---------------------------------------------

export async function createNodeDal(db: SupabaseClient, input: NodeInput, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('graph_nodes').upsert({
      node_type: input.nodeType, entity_id: input.entityId, label: input.label, status: input.status ?? null,
      metadata: input.metadata ?? {}, created_by: actorId, updated_at: new Date().toISOString(),
    }, { onConflict: 'node_type,entity_id' }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (e) { return fail(e); }
}

export async function createEdgeDal(db: SupabaseClient, input: {
  sourceNodeId: string; targetNodeId: string; relationshipType: RelationshipType; confidence: number; provenance: string;
}, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('graph_edges').upsert({
      source_node_id: input.sourceNodeId, target_node_id: input.targetNodeId, relationship_type: input.relationshipType,
      confidence: input.confidence, provenance: input.provenance, evidence_summary: input.provenance,
      created_by: actorId, updated_at: new Date().toISOString(),
    }, { onConflict: 'source_node_id,target_node_id,relationship_type' }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    const id = (data as { id: string }).id;
    await db.from('graph_edge_evidence').insert({ edge_id: id, evidence_kind: 'manual', note: input.provenance }).then(() => undefined, () => undefined);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function removeEdgeDal(db: SupabaseClient, id: string): Promise<DbResult<{ id: string }>> {
  try {
    const { error } = await db.from('graph_edges').delete().eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

// ---- reads ------------------------------------------------------------------

export async function getNodeDal(db: SupabaseClient, id: string): Promise<GraphNode | null> {
  try {
    const { data } = await db.from('graph_nodes').select(NODE_COLS).eq('id', id).maybeSingle();
    return data ? mapNode(data as Record<string, unknown>) : null;
  } catch { return null; }
}

export async function getNeighborsDal(db: SupabaseClient, nodeId: string, opts: { relationship?: RelationshipType; limit?: number } = {}): Promise<Neighbor[]> {
  const limit = opts.limit ?? 100;
  try {
    let outQ = db.from('graph_edges').select(EDGE_COLS).eq('source_node_id', nodeId);
    let inQ = db.from('graph_edges').select(EDGE_COLS).eq('target_node_id', nodeId);
    if (opts.relationship) { outQ = outQ.eq('relationship_type', opts.relationship); inQ = inQ.eq('relationship_type', opts.relationship); }
    const [outRes, inRes] = await Promise.all([outQ.limit(limit), inQ.limit(limit)]);
    const out = ((outRes.data ?? []) as Array<Record<string, unknown>>).map(mapEdge);
    const inc = ((inRes.data ?? []) as Array<Record<string, unknown>>).map(mapEdge);
    const neighborIds = new Set<string>();
    out.forEach((e) => neighborIds.add(e.targetNodeId));
    inc.forEach((e) => neighborIds.add(e.sourceNodeId));
    if (neighborIds.size === 0) return [];
    const { data: nodeRows } = await db.from('graph_nodes').select(NODE_COLS).in('id', Array.from(neighborIds));
    const nodeById = new Map<string, GraphNode>();
    for (const r of (nodeRows ?? []) as Array<Record<string, unknown>>) { const nn = mapNode(r); nodeById.set(nn.id, nn); }
    const result: Neighbor[] = [];
    for (const e of out) { const node = nodeById.get(e.targetNodeId); if (node) result.push({ edge: e, node, direction: 'outgoing' }); }
    for (const e of inc) { const node = nodeById.get(e.sourceNodeId); if (node) result.push({ edge: e, node, direction: 'incoming' }); }
    return result;
  } catch { return []; }
}

/** Bounded subgraph around a node (paged BFS). Caps nodes + depth. */
export async function getSubgraphDal(db: SupabaseClient, startId: string, depth = 2, maxNodes = 120): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }> {
  try {
    const collectedEdges = new Map<string, GraphEdge>();
    let frontier = [startId];
    const seen = new Set<string>([startId]);
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const [outRes, inRes] = await Promise.all([
        db.from('graph_edges').select(EDGE_COLS).in('source_node_id', frontier).limit(800),
        db.from('graph_edges').select(EDGE_COLS).in('target_node_id', frontier).limit(800),
      ]);
      const next = new Set<string>();
      for (const r of [...((outRes.data ?? []) as Array<Record<string, unknown>>), ...((inRes.data ?? []) as Array<Record<string, unknown>>)]) {
        const e = mapEdge(r);
        collectedEdges.set(e.id, e);
        for (const nb of [e.sourceNodeId, e.targetNodeId]) {
          if (!seen.has(nb) && seen.size < maxNodes) { seen.add(nb); next.add(nb); }
        }
      }
      frontier = Array.from(next);
    }
    const ids = Array.from(seen);
    const nodes: GraphNode[] = [];
    for (const part of chunk(ids, 300)) {
      const { data } = await db.from('graph_nodes').select(NODE_COLS).in('id', part);
      for (const r of (data ?? []) as Array<Record<string, unknown>>) nodes.push(mapNode(r));
    }
    return { nodes, edges: Array.from(collectedEdges.values()), truncated: seen.size >= maxNodes };
  } catch { return { nodes: [], edges: [], truncated: false }; }
}

/** Graph depth reachable from a node (bounded), via the pure traverse(). */
export async function graphDepthDal(db: SupabaseClient, startId: string): Promise<number> {
  const sg = await getSubgraphDal(db, startId, 4, 300);
  const edges = sg.edges.map((e) => ({ from: e.sourceNodeId, to: e.targetNodeId }));
  const { depthOf } = traverse(edges, startId, 4, 300);
  let max = 0; for (const v of depthOf.values()) if (v > max) max = v;
  return max;
}

export async function searchNodesDal(db: SupabaseClient, q: string, nodeType: NodeType | null, limit = 25): Promise<GraphNode[]> {
  try {
    let query = db.from('graph_nodes').select(NODE_COLS);
    if (nodeType) query = query.eq('node_type', nodeType);
    if (q.trim()) query = query.ilike('label', `%${q.trim()}%`);
    const { data } = await query.order('created_at', { ascending: false }).limit(limit);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapNode);
  } catch { return []; }
}

export interface GraphCounts { nodes: number; edges: number; nodesByType: Record<string, number>; edgesByRelationship: Record<string, number> }

export async function getCountsDal(db: SupabaseClient): Promise<GraphCounts> {
  const out: GraphCounts = { nodes: 0, edges: 0, nodesByType: {}, edgesByRelationship: {} };
  try {
    const { count: nc } = await db.from('graph_nodes').select('id', { count: 'exact', head: true });
    out.nodes = nc ?? 0;
    const { count: ec } = await db.from('graph_edges').select('id', { count: 'exact', head: true });
    out.edges = ec ?? 0;
    const { data: nt } = await db.from('graph_nodes').select('node_type').limit(20000);
    for (const r of (nt ?? []) as Array<{ node_type: string }>) out.nodesByType[r.node_type] = (out.nodesByType[r.node_type] ?? 0) + 1;
    const { data: er } = await db.from('graph_edges').select('relationship_type').limit(20000);
    for (const r of (er ?? []) as Array<{ relationship_type: string }>) out.edgesByRelationship[r.relationship_type] = (out.edgesByRelationship[r.relationship_type] ?? 0) + 1;
  } catch { /* degrade */ }
  return out;
}

/** Top-connected nodes by degree, from a bounded edge read. */
export async function topConnectedDal(db: SupabaseClient, nodeType: NodeType | null, limit = 8): Promise<Array<{ node: GraphNode; degree: number }>> {
  try {
    const { data } = await db.from('graph_edges').select('source_node_id, target_node_id').limit(20000);
    const degree = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ source_node_id: string; target_node_id: string }>) {
      degree.set(r.source_node_id, (degree.get(r.source_node_id) ?? 0) + 1);
      degree.set(r.target_node_id, (degree.get(r.target_node_id) ?? 0) + 1);
    }
    const top = Array.from(degree.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit * 4).map(([id]) => id);
    if (top.length === 0) return [];
    const { data: nodeRows } = await db.from('graph_nodes').select(NODE_COLS).in('id', top);
    const byId = new Map<string, GraphNode>();
    for (const r of (nodeRows ?? []) as Array<Record<string, unknown>>) { const nn = mapNode(r); byId.set(nn.id, nn); }
    return top
      .map((id) => ({ node: byId.get(id), degree: degree.get(id) ?? 0 }))
      .filter((x): x is { node: GraphNode; degree: number } => !!x.node && (!nodeType || x.node.nodeType === nodeType))
      .slice(0, limit);
  } catch { return []; }
}

export { fail };
