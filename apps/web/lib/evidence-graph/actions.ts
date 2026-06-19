'use server';

// =============================================================================
// HSI Phase 64 — Evidence Graph server actions. Graph rebuild is admin-gated +
// audited (prefers the service-role client). Edge create/remove delegate to the
// RBAC-enforcing service. Return DbResult; never throw. SERVER-ONLY.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { requireAdmin, getServiceClient, recordSecurityAudit } from '@/lib/admin/guard';
import { buildGraph, type GraphBuildSummary } from './builder';
import * as graph from './service';
import type { DbResult } from './persistence';
import type { RelationshipType } from './types';

const ROUTE = '/dashboard/evidence-graph';
function rev(): void { try { revalidatePath(ROUTE); } catch { /* best-effort */ } }

/** Rebuild the evidence graph from existing intelligence (admin, audited). */
export async function rebuildGraphAction(): Promise<DbResult<GraphBuildSummary>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  try {
    const service = await getServiceClient();
    const writer = service ?? gate.ctx.db;
    const summary = await buildGraph(writer, gate.ctx.user.id);
    await recordSecurityAudit(gate.ctx.db, {
      actorId: gate.ctx.user.id, eventType: 'EVIDENCE_GRAPH_REBUILD',
      message: `Evidence graph rebuilt: ${summary.nodes} nodes, ${summary.edges} edges.`, metadata: { ...summary },
    });
    rev();
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Graph rebuild failed.', code: 'DB_ERROR' };
  }
}

export async function createGraphEdgeAction(input: { sourceNodeId: string; targetNodeId: string; relationshipType: RelationshipType; confidence?: number; provenance: string }): Promise<DbResult<{ id: string }>> {
  const r = await graph.createEdge(input);
  if (r.ok) rev();
  return r;
}

export async function removeGraphEdgeAction(id: string): Promise<DbResult<{ id: string }>> {
  const r = await graph.removeEdge(id);
  if (r.ok) rev();
  return r;
}
