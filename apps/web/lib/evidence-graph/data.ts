// =============================================================================
// HSI Phase 64 — Evidence Graph dashboard data (SERVER-ONLY, read). Composes the
// graph overview + executive metrics from the persisted graph (reviewer+ RLS).
// Every number is computed from real nodes/edges — nothing fabricated. Never throws.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { getCountsDal, topConnectedDal } from './persistence';
import type { GraphNode } from './types';

export interface ConnectedEntity { node: GraphNode; degree: number }

export interface EvidenceGraphDashboard {
  totalNodes: number;
  totalEdges: number;
  avgConnectivity: number;
  nodeDistribution: { type: string; count: number }[];
  relationshipDistribution: { type: string; count: number }[];
  topConnected: ConnectedEntity[];
  topSources: ConnectedEntity[];
  topActors: ConnectedEntity[];
  mostReferencedClaims: ConnectedEntity[];
  mostCorrectedReports: ConnectedEntity[];
  mostConnectedNarratives: ConnectedEntity[];
}

export async function getEvidenceGraphDashboard(): Promise<EvidenceGraphDashboard> {
  const db = createClient();
  const counts = await getCountsDal(db);
  const [topConnected, topSources, topActors, claims, reports, narratives] = await Promise.all([
    topConnectedDal(db, null, 10),
    topConnectedDal(db, 'SOURCE', 5),
    topConnectedDal(db, 'ACTOR', 5),
    topConnectedDal(db, 'EVIDENCE', 5),
    topConnectedDal(db, 'REPORT', 5),
    topConnectedDal(db, 'NARRATIVE', 5),
  ]);

  const avgConnectivity = counts.nodes > 0 ? Math.round(((counts.edges * 2) / counts.nodes) * 100) / 100 : 0;

  return {
    totalNodes: counts.nodes,
    totalEdges: counts.edges,
    avgConnectivity,
    nodeDistribution: Object.entries(counts.nodesByType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    relationshipDistribution: Object.entries(counts.edgesByRelationship).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    topConnected,
    topSources,
    topActors,
    mostReferencedClaims: claims,
    mostCorrectedReports: reports,
    mostConnectedNarratives: narratives,
  };
}
