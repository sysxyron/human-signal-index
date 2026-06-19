// =============================================================================
// HSI Phase 64 — Evidence Graph service API (SERVER-ONLY). The public surface
// other code calls. Resolves the signed-in user + RLS client and ENFORCES RBAC:
// reviewer+ for reads, admin for mutations. RLS is the real boundary; these gates
// give clean errors. Never throws.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import * as dal from './persistence';
import type { DbResult } from './persistence';
import {
  type GraphNode, type GraphEdge, type Neighbor, type NodeSummary, type NodeType, type RelationshipType,
  summarizeNode,
} from './types';

async function ctx() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to use the evidence graph.', code: 'AUTH_REQUIRED' as const };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  return { ok: true as const, userId: user.id, db, isReviewer: hasRole(role ?? undefined, 'reviewer'), isAdmin: hasRole(role ?? undefined, 'admin') };
}

// ---- mutations (admin) ------------------------------------------------------

export async function createNode(input: dal.NodeInput): Promise<DbResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Creating graph nodes is admin-only.', code: 'FORBIDDEN' };
  return dal.createNodeDal(c.db, input, c.userId);
}

export async function createEdge(input: { sourceNodeId: string; targetNodeId: string; relationshipType: RelationshipType; confidence?: number; provenance: string }): Promise<DbResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Creating graph edges is admin-only.', code: 'FORBIDDEN' };
  if (!input.provenance?.trim()) return { ok: false, error: 'Every edge requires provenance.', code: 'DB_ERROR' };
  const confidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 1;
  return dal.createEdgeDal(c.db, { ...input, confidence }, c.userId);
}

export async function removeEdge(id: string): Promise<DbResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isAdmin) return { ok: false, error: 'Removing graph edges is admin-only.', code: 'FORBIDDEN' };
  return dal.removeEdgeDal(c.db, id);
}

// ---- reads (reviewer+) ------------------------------------------------------

async function reviewerCtx() {
  const c = await ctx();
  if (!c.ok) return c;
  if (!c.isReviewer) return { ok: false as const, error: 'The evidence graph is restricted to reviewers and admins.', code: 'FORBIDDEN' as const };
  return c;
}

export async function getNode(id: string): Promise<DbResult<GraphNode>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const node = await dal.getNodeDal(c.db, id);
  return node ? { ok: true, data: node } : { ok: false, error: 'Node not found.', code: 'DB_ERROR' };
}

export async function getNeighbors(nodeId: string, opts?: { relationship?: RelationshipType; limit?: number }): Promise<DbResult<Neighbor[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getNeighborsDal(c.db, nodeId, opts ?? {}) };
}

export async function getGraphSubgraph(startId: string, depth = 2, maxNodes = 120): Promise<DbResult<{ nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getSubgraphDal(c.db, startId, depth, maxNodes) };
}

export async function getConnectedEvidence(nodeId: string): Promise<DbResult<Neighbor[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const all = await dal.getNeighborsDal(c.db, nodeId, { limit: 200 });
  return { ok: true, data: all.filter((nb) => nb.node.nodeType === 'EVIDENCE' || nb.node.nodeType === 'CLAIM') };
}

export async function getSupportingEvidence(nodeId: string): Promise<DbResult<Neighbor[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getNeighborsDal(c.db, nodeId, { relationship: 'SUPPORTS', limit: 200 }) };
}

export async function getContradictingEvidence(nodeId: string): Promise<DbResult<Neighbor[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.getNeighborsDal(c.db, nodeId, { relationship: 'CONTRADICTS', limit: 200 }) };
}

export async function getNodeSummary(nodeId: string): Promise<DbResult<{ node: GraphNode; summary: NodeSummary; neighbors: Neighbor[] }>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  const node = await dal.getNodeDal(c.db, nodeId);
  if (!node) return { ok: false, error: 'Node not found.', code: 'DB_ERROR' };
  const neighbors = await dal.getNeighborsDal(c.db, nodeId, { limit: 300 });
  const depth = await dal.graphDepthDal(c.db, nodeId);
  return { ok: true, data: { node, summary: summarizeNode(neighbors, depth), neighbors } };
}

export async function searchNodes(q: string, nodeType: NodeType | null = null, limit = 25): Promise<DbResult<GraphNode[]>> {
  const c = await reviewerCtx();
  if (!c.ok) return c;
  return { ok: true, data: await dal.searchNodesDal(c.db, q, nodeType, limit) };
}
