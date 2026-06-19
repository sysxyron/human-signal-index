// =============================================================================
// HSI Phase 64 — Evidence Graph builder (SERVER-ONLY).
//
// Composes the graph DETERMINISTICALLY from existing data via real foreign keys
// and stored tallies — NO AI inference, NO fabricated edges. Every edge records
// its provenance (the exact column / fact it came from). Reads use the
// service-role-preferred read client; writes use the passed admin/service-role
// writer. Idempotent (node/edge upserts dedupe), so it is safe to re-run.
//
// Deterministic edges built:
//   SIGNAL  --DERIVED_FROM-->     SOURCE         (hsin_signals.source_id)
//   EVIDENCE --SUPPORTS/CONTRADICTS--> INVESTIGATION (claim support/challenge tallies)
//   EVIDENCE --RELATED_TO-->     EVIDENCE        (shared investigation, star)
//   REPORT  --CORRECTED_BY-->    CORRECTION      (publication_versions to_state=RETRACTED)
//   WATCHLIST --WATCHES-->       SOURCE          (hsin_watchlist_sources)
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { readPublicClient } from '@/lib/public-intelligence';
import { upsertNodes, upsertEdges, nodeKey, type NodeInput, type EdgeInput } from './persistence';
import { stanceFor, stanceConfidence, FK_CONFIDENCE, STRUCTURAL_CONFIDENCE } from './catalog';

function trunc(s: string | null | undefined, n = 120): string {
  const t = (s ?? '').trim();
  return t.length > n ? `${t.slice(0, n)}…` : (t || '(untitled)');
}

export interface GraphBuildSummary {
  nodes: number; edges: number; runAt: string;
  byNodeType: Record<string, number>;
}

/** Build/refresh the evidence graph from existing intelligence. Never throws. */
export async function buildGraph(writer: SupabaseClient, actorId: string | null): Promise<GraphBuildSummary> {
  const runAt = new Date().toISOString();
  const reader = readPublicClient() ?? writer;
  const nodes: NodeInput[] = [];
  const edges: EdgeInput[] = [];
  const byNodeType: Record<string, number> = {};
  const addNode = (n: NodeInput) => { nodes.push(n); byNodeType[n.nodeType] = (byNodeType[n.nodeType] ?? 0) + 1; };

  // ---- sources ----
  try {
    const { data } = await reader.from('hsin_sources').select('id, name').limit(1000);
    for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) addNode({ nodeType: 'SOURCE', entityId: r.id, label: trunc(r.name, 80) });
  } catch { /* ignore */ }

  // ---- signals + DERIVED_FROM source ----
  try {
    const { data } = await reader.from('hsin_signals').select('id, title, source_id, status').limit(4000);
    for (const r of (data ?? []) as Array<{ id: string; title: string | null; source_id: string | null; status: string | null }>) {
      addNode({ nodeType: 'SIGNAL', entityId: r.id, label: trunc(r.title), status: r.status });
      if (r.source_id) {
        edges.push({
          sourceKey: nodeKey('SIGNAL', r.id), targetKey: nodeKey('SOURCE', r.source_id),
          relationshipType: 'DERIVED_FROM', confidence: FK_CONFIDENCE,
          provenance: 'hsin_signals.source_id (explicit foreign key)', evidenceKind: 'foreign_key', evidenceRef: r.source_id,
        });
      }
    }
  } catch { /* ignore */ }

  // ---- evidence claims + investigations + stance/related edges ----
  try {
    const { data } = await reader.from('hsin_evidence_claims').select('id, claim, investigation_id, support_count, challenge_count, strength').limit(3000);
    const rows = (data ?? []) as Array<{ id: string; claim: string | null; investigation_id: string | null; support_count: number | null; challenge_count: number | null; strength: number | null }>;
    const claimsByInvestigation = new Map<string, string[]>();
    const seenInvestigation = new Set<string>();
    for (const r of rows) {
      addNode({ nodeType: 'EVIDENCE', entityId: r.id, label: trunc(r.claim) });
      if (r.investigation_id) {
        if (!seenInvestigation.has(r.investigation_id)) {
          seenInvestigation.add(r.investigation_id);
          addNode({ nodeType: 'INVESTIGATION', entityId: r.investigation_id, label: `Investigation ${r.investigation_id.slice(0, 8)}` });
        }
        const support = r.support_count ?? 0;
        const challenge = r.challenge_count ?? 0;
        edges.push({
          sourceKey: nodeKey('EVIDENCE', r.id), targetKey: nodeKey('INVESTIGATION', r.investigation_id),
          relationshipType: stanceFor(support, challenge), confidence: stanceConfidence(support, challenge, r.strength),
          provenance: `support_count ${support} vs challenge_count ${challenge}` + (r.strength != null ? ` (strength ${r.strength})` : ''),
          evidenceKind: 'tally', evidenceRef: r.investigation_id,
        });
        const list = claimsByInvestigation.get(r.investigation_id) ?? [];
        list.push(r.id);
        claimsByInvestigation.set(r.investigation_id, list);
      }
    }
    // RELATED_TO: star within each investigation (bounded, deterministic provenance).
    for (const [invId, ids] of claimsByInvestigation) {
      if (ids.length < 2) continue;
      const anchor = ids[0];
      for (let i = 1; i < ids.length; i++) {
        edges.push({
          sourceKey: nodeKey('EVIDENCE', ids[i]), targetKey: nodeKey('EVIDENCE', anchor),
          relationshipType: 'RELATED_TO', confidence: STRUCTURAL_CONFIDENCE,
          provenance: `shared investigation ${invId.slice(0, 8)}`, evidenceKind: 'shared_container', evidenceRef: invId,
        });
      }
    }
  } catch { /* ignore */ }

  // ---- publications (REPORT) ----
  try {
    const { data } = await reader.from('hsin_publications').select('id, title, state').limit(1000);
    for (const r of (data ?? []) as Array<{ id: string; title: string | null; state: string | null }>) {
      addNode({ nodeType: 'REPORT', entityId: r.id, label: trunc(r.title, 100), status: r.state });
    }
  } catch { /* ignore */ }

  // ---- corrections (retractions) + CORRECTED_BY ----
  try {
    const { data } = await reader.from('hsin_publication_versions').select('id, publication_id, to_state').eq('to_state', 'RETRACTED').limit(1000);
    for (const r of (data ?? []) as Array<{ id: string; publication_id: string | null; to_state: string | null }>) {
      addNode({ nodeType: 'CORRECTION', entityId: r.id, label: 'Retraction' });
      if (r.publication_id) {
        edges.push({
          sourceKey: nodeKey('REPORT', r.publication_id), targetKey: nodeKey('CORRECTION', r.id),
          relationshipType: 'CORRECTED_BY', confidence: FK_CONFIDENCE,
          provenance: 'hsin_publication_versions.to_state = RETRACTED', evidenceKind: 'state_transition', evidenceRef: r.id,
        });
      }
    }
  } catch { /* ignore */ }

  // ---- watchlists + WATCHES source ----
  try {
    const { data } = await reader.from('hsin_watchlists').select('id, name').limit(500);
    for (const r of (data ?? []) as Array<{ id: string; name: string | null }>) addNode({ nodeType: 'WATCHLIST', entityId: r.id, label: trunc(r.name, 80) });
    const { data: ws } = await reader.from('hsin_watchlist_sources').select('watchlist_id, source_id').limit(5000);
    for (const r of (ws ?? []) as Array<{ watchlist_id: string; source_id: string }>) {
      edges.push({
        sourceKey: nodeKey('WATCHLIST', r.watchlist_id), targetKey: nodeKey('SOURCE', r.source_id),
        relationshipType: 'WATCHES', confidence: FK_CONFIDENCE,
        provenance: 'hsin_watchlist_sources (explicit foreign key)', evidenceKind: 'foreign_key', evidenceRef: r.source_id,
      });
    }
  } catch { /* ignore */ }

  // ---- persist (idempotent upserts) ----
  const keyToId = await upsertNodes(writer, nodes, actorId);
  const edgesWritten = await upsertEdges(writer, edges, keyToId, actorId);

  return { nodes: keyToId.size, edges: edgesWritten, runAt, byNodeType };
}
