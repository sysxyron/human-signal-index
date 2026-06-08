// =============================================================================
// @hsi/source-intelligence — NARRATIVE GRAPH assembler (Phase 8).
//
// Top-level convenience used by the app + UI. Pipeline:
//   clusterNarratives → NarrativeNodes (+ aggregated extractEntities) →
//   buildNarrativeEdges → assemble NarrativeGraph.
//
// Deterministic; never throws (embedding failures degrade to lexical). Produces
// a research VIEW over PUBLIC signals — DRAFT structure for human review, never
// an auto-published claim. A heuristic riskLevel per node aids triage only.
// =============================================================================

import { clusterNarratives, type ClusterSignal } from '../semantic/narrativeClusterer';
import type { SemanticDeps } from '../semantic/types';
import { clamp, round } from '../internal/text';
import { buildNarrativeEdges, type EdgeSignal } from './edgeBuilder';
import { extractEntities } from './entityExtractor';
import type {
  ExtractedEntity,
  NarrativeGraph,
  NarrativeNode,
  SignalNarrativeLink,
} from './types';

export interface GraphSignal {
  id: string;
  title: string;
  bodyText?: string;
  category?: string;
  capturedAt?: string;
  /** Optional human/prior risk weighting in [0,1] for this signal's source. */
  riskLevel?: number;
}

/** Higher-risk categories nudge a node's heuristic riskLevel up (triage aid). */
const HIGH_RISK_CATEGORIES = new Set([
  'extinction', 'population', 'recruitment', 'disinformation',
]);

function nodeText(node: NarrativeNode, byId: Map<string, GraphSignal>): string {
  const parts = [node.name];
  for (const id of node.signalIds) {
    const s = byId.get(id);
    if (s) parts.push(`${s.title}\n${s.bodyText ?? ''}`);
  }
  return parts.join('\n');
}

/** Heuristic node risk: category weight + max source risk + signal volume. */
function nodeRisk(node: NarrativeNode, byId: Map<string, GraphSignal>): number {
  const catRisk = node.category && HIGH_RISK_CATEGORIES.has(node.category) ? 0.5 : 0.2;
  let maxSourceRisk = 0;
  for (const id of node.signalIds) {
    const r = byId.get(id)?.riskLevel ?? 0;
    if (r > maxSourceRisk) maxSourceRisk = r;
  }
  const volume = clamp(node.signalIds.length / 5, 0, 0.3);
  return round(clamp(catRisk * 0.6 + maxSourceRisk * 0.3 + volume, 0, 1));
}

/**
 * Build the full narrative + entity graph for a batch of signals.
 * Deterministic; never throws.
 */
export async function buildNarrativeGraph(
  signals: GraphSignal[],
  deps: SemanticDeps = {},
): Promise<NarrativeGraph> {
  if (signals.length === 0) return { nodes: [], edges: [], entities: [] };
  const byId = new Map(signals.map((s) => [s.id, s]));

  // (1) Cluster signals into candidate narratives.
  const clusterSignals: ClusterSignal[] = signals.map((s) => ({
    id: s.id,
    title: s.title,
    bodyText: s.bodyText,
    category: s.category,
  }));
  const { clusters } = await clusterNarratives(clusterSignals, deps);

  // (2) Build nodes (+ description from centroid terms + heuristic risk).
  const nodes: NarrativeNode[] = clusters.map((c) => {
    const node: NarrativeNode = {
      id: c.id,
      name: c.label,
      description:
        `Candidate narrative over ${c.signalIds.length} signal(s); ` +
        `key terms: ${c.centroidTerms.join(', ') || 'n/a'}.`,
      category: c.category,
      signalIds: c.signalIds,
    };
    node.riskLevel = nodeRisk(node, byId);
    return node;
  });

  // (3) Aggregate entities across ALL signals (de-duped, strongest mention wins).
  const entityByName = new Map<string, ExtractedEntity>();
  for (const node of nodes) {
    for (const e of extractEntities(nodeText(node, byId))) {
      const key = e.name.toLowerCase();
      const existing = entityByName.get(key);
      if (!existing || e.confidence > existing.confidence) entityByName.set(key, e);
    }
  }
  const entities = [...entityByName.values()].sort(
    (a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name),
  );

  // (4) Build explainable edges between nodes.
  const edgeSignals: EdgeSignal[] = signals.map((s) => ({
    id: s.id,
    title: s.title,
    bodyText: s.bodyText,
    category: s.category,
    capturedAt: s.capturedAt,
  }));
  const edges = await buildNarrativeEdges(nodes, edgeSignals, deps);

  return { nodes, edges, entities };
}

/**
 * Map each signal to the narrative node it belongs to, with an explainable
 * confidence (membership is exact from clustering, so confidence reflects how
 * cohesive the parent narrative is — larger, single-category clusters are surer).
 * Pure & deterministic.
 */
export function signalToNarrativeLinks(
  signals: { id: string; category?: string }[],
  nodes: NarrativeNode[],
): SignalNarrativeLink[] {
  const links: SignalNarrativeLink[] = [];
  for (const node of nodes) {
    const size = node.signalIds.length;
    for (const sid of node.signalIds) {
      const sig = signals.find((s) => s.id === sid);
      const categoryAgrees = sig?.category && node.category && sig.category === node.category;
      const confidence = round(
        clamp(0.5 + (size > 1 ? 0.2 : 0) + (categoryAgrees ? 0.2 : 0), 0, 0.95),
      );
      links.push({
        signalId: sid,
        narrativeId: node.id,
        confidence,
        rationale:
          `Signal "${sid}" clustered into narrative "${node.name}" ` +
          `(${size} signal(s)${node.category ? `, category ${node.category}` : ''}` +
          `${categoryAgrees ? ', category agrees' : ''}).`,
      });
    }
  }
  // Deterministic ordering by signal then narrative.
  links.sort(
    (a, b) => a.signalId.localeCompare(b.signalId) || a.narrativeId.localeCompare(b.narrativeId),
  );
  return links;
}
