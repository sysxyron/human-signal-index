// =============================================================================
// WorldForge Phase 5 — server-only resolver for the [id]/evidence-graph route.
// Mirrors the evidence-tab resolver: resolves a run id (+ optional ?demo) into a
// ClaimEvidenceGraph. The labeled Chronid demo builds the graph in-process from
// chronidResearchDemo() + the fixture evidence engine (no DB, no API keys);
// everything else loads the persisted graph via the evidence DAL. Never throws —
// returns a tagged result. Underscore prefix keeps it out of the router.
//
// SERVER-ONLY: imports the server DAL + engine packages. Do NOT import from a
// 'use client' module.
// =============================================================================

import { chronidResearchDemo } from '@hsi/research-agents';
import type { Claim } from '@hsi/research-agents';
import {
  createEvidenceEngine,
  gatherEvidence,
  type EvidenceResult,
  type ClaimEvidence,
} from '@hsi/evidence-engine';
import { getClaimEvidenceGraph } from '@/lib/worldforge/evidence-persistence';
import { DEMO_RUN_ID } from '@/lib/worldforge/research-view';
import type { DbResultCode } from '@/lib/worldforge/evidence-view';
import type {
  ClaimEvidenceGraph,
  ClaimEvidenceGraphNode,
  ClaimEvidenceGraphEdge,
} from '@/lib/worldforge/evidence-intel-view';

export type ResolveGraphResult =
  | { kind: 'ok'; graph: ClaimEvidenceGraph; isDemo: boolean }
  | { kind: 'error'; message: string; code?: DbResultCode };

function isDemoRequest(id: string, searchParams?: { demo?: string }): boolean {
  return id === DEMO_RUN_ID || searchParams?.demo === '1';
}

/** Narrow an engine SupportType (or any string) to a graph edge support type. */
function normalizeSupport(
  value: string | undefined,
): ClaimEvidenceGraphEdge['supportType'] {
  if (value === 'supports' || value === 'contradicts' || value === 'background') {
    return value;
  }
  return 'unclear';
}

/**
 * Build a ClaimEvidenceGraph from the demo research claims + fixture evidence.
 * Deterministic, no API keys, clearly demo. Claim nodes carry their tier; source
 * nodes carry publication/reliability meta; edges carry support type + confidence.
 */
async function computeDemoGraph(): Promise<ClaimEvidenceGraph> {
  const run = chronidResearchDemo();
  const claims: Claim[] = run.agentOutputs.flatMap((a) => a.claims);
  const engine = createEvidenceEngine({ mode: 'fixture' });
  const { matches, sources } = await gatherEvidence(claims, engine);

  const claimById = new Map<string, Claim>();
  for (const c of claims) claimById.set(c.id, c);

  const nodes: ClaimEvidenceGraphNode[] = [];
  const edges: ClaimEvidenceGraphEdge[] = [];
  const sourceSeen = new Set<string>();
  const sourceById = new Map<string, EvidenceResult>();
  for (const s of sources) sourceById.set(s.id, s);

  // Only include claims that actually matched evidence, so the graph stays
  // legible. (Unsupported claims are surfaced honestly on the evidence tab.)
  const matchedClaimIds = new Set<string>();
  for (const m of matches as ClaimEvidence[]) {
    if (m.results.length > 0) matchedClaimIds.add(m.claimId);
  }

  for (const claimId of matchedClaimIds) {
    const claim = claimById.get(claimId);
    if (!claim) continue;
    nodes.push({
      id: `claim:${claimId}`,
      kind: 'claim',
      label: claim.text,
      tier: claim.tier,
      meta: { source: claim.source, confidence: claim.confidence },
    });
  }

  for (const m of matches as ClaimEvidence[]) {
    if (!matchedClaimIds.has(m.claimId)) continue;
    for (const r of m.results) {
      const sourceNodeId = `source:${r.id}`;
      if (!sourceSeen.has(r.id)) {
        sourceSeen.add(r.id);
        const src = sourceById.get(r.id) ?? r;
        nodes.push({
          id: sourceNodeId,
          kind: 'source',
          label: src.title,
          supportType: normalizeSupport(r.supportType),
          meta: {
            provider: src.sourceName,
            publicationType: src.publicationType,
            reliability: src.reliabilityScore,
            year: src.year,
            confidence: r.confidence,
          },
        });
      }
      edges.push({
        id: `${m.claimId}::${r.id}`,
        source: `claim:${m.claimId}`,
        target: sourceNodeId,
        supportType: normalizeSupport(r.supportType),
        confidence: r.confidence,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Resolve a run's claim->evidence graph. The demo short-circuits to in-process
 * fixture evidence (no DB); everything else goes through the evidence DAL.
 */
export async function resolveGraphView(
  id: string,
  searchParams?: { demo?: string },
): Promise<ResolveGraphResult> {
  if (isDemoRequest(id, searchParams)) {
    const graph = await computeDemoGraph();
    return { kind: 'ok', graph, isDemo: true };
  }

  const res = await getClaimEvidenceGraph(id);
  if (res.ok) {
    return { kind: 'ok', graph: res.data, isDemo: false };
  }
  return { kind: 'error', message: res.error, code: res.code };
}
