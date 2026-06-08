// =============================================================================
// @hsi/source-intelligence — cross-source narrative analysis (Phase 9).
//
// clusterNarrativesCrossSource clusters signals (reusing the Phase-8
// clusterNarratives) and tags each cluster with the DISTINCT sourceIds that
// contributed — surfacing narratives that span MULTIPLE sources (a stronger
// signal than one source repeating itself).
//
// sourceNarrativeOverlap builds a source-to-source overlap matrix: for each pair
// of sources, how many shared narratives they participate in, plus a normalized
// overlap score (Jaccard over the sources' narrative sets).
//
// Deterministic; embeddings optional (injected `embed`); never throws. Drafts
// for human review over PUBLIC signals only.
// =============================================================================

import { clusterNarratives, type ClusterSignal } from '../semantic/narrativeClusterer';
import { round } from '../internal/text';

export interface CrossSourceSignal {
  id: string;
  sourceId?: string;
  title: string;
  bodyText?: string;
  category?: string;
  capturedAt?: string;
}

export interface CrossSourceDeps {
  /** Injected embedding fn (else lexical fallback). */
  embed?: (texts: string[]) => Promise<number[][]>;
  /** ISO now (determinism; reserved for future recency weighting). */
  now?: string;
}

export interface CrossSourceCluster {
  id: string;
  label: string;
  signalIds: string[];
  category?: string;
  centroidTerms: string[];
  /** Distinct contributing sources (sorted) — breadth of the narrative. */
  sourceIds: string[];
}

export interface CrossSourceResult {
  clusters: CrossSourceCluster[];
}

/**
 * Cluster signals across sources and tag each cluster with its contributing
 * sourceIds. Deterministic; never throws.
 */
export async function clusterNarrativesCrossSource(
  signals: CrossSourceSignal[],
  deps: CrossSourceDeps = {},
): Promise<CrossSourceResult> {
  if (signals.length === 0) return { clusters: [] };

  const sourceBySignal = new Map(signals.map((s) => [s.id, s.sourceId]));
  const clusterSignals: ClusterSignal[] = signals.map((s) => ({
    id: s.id,
    title: s.title,
    bodyText: s.bodyText,
    category: s.category,
  }));

  const { clusters } = await clusterNarratives(clusterSignals, {
    embed: deps.embed,
    now: deps.now,
  });

  const out: CrossSourceCluster[] = clusters.map((c) => {
    const sourceIds = [
      ...new Set(
        c.signalIds
          .map((id) => sourceBySignal.get(id))
          .filter((sid): sid is string => Boolean(sid)),
      ),
    ].sort((a, b) => a.localeCompare(b));
    return {
      id: c.id,
      label: c.label,
      signalIds: c.signalIds,
      category: c.category,
      centroidTerms: c.centroidTerms,
      sourceIds,
    };
  });

  return { clusters: out };
}

/** A source-to-source narrative overlap entry. */
export interface SourceOverlap {
  a: string;
  b: string;
  /** Count of narratives both sources participate in. */
  sharedNarratives: number;
  /** Jaccard overlap of the two sources' narrative sets (0..1). */
  overlapScore: number;
}

/**
 * Build the source-to-source narrative overlap matrix. Clusters the signals,
 * maps each source to the set of narratives it participates in, then computes
 * shared-narrative counts + a Jaccard overlap score for every source pair.
 * Pairs with zero overlap are omitted. Deterministic; never throws.
 */
export async function sourceNarrativeOverlap(
  signals: CrossSourceSignal[],
  deps: CrossSourceDeps = {},
): Promise<SourceOverlap[]> {
  const { clusters } = await clusterNarrativesCrossSource(signals, deps);

  // sourceId → set of narrative ids it participates in.
  const sourceNarratives = new Map<string, Set<string>>();
  for (const c of clusters) {
    for (const sid of c.sourceIds) {
      const set = sourceNarratives.get(sid) ?? new Set<string>();
      set.add(c.id);
      sourceNarratives.set(sid, set);
    }
  }

  const sources = [...sourceNarratives.keys()].sort((a, b) => a.localeCompare(b));
  const out: SourceOverlap[] = [];
  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      const sa = sourceNarratives.get(sources[i])!;
      const sb = sourceNarratives.get(sources[j])!;
      let shared = 0;
      for (const n of sa) if (sb.has(n)) shared += 1;
      if (shared === 0) continue;
      const union = sa.size + sb.size - shared;
      const overlapScore = union === 0 ? 0 : round(shared / union);
      out.push({ a: sources[i], b: sources[j], sharedNarratives: shared, overlapScore });
    }
  }

  out.sort((x, y) => y.overlapScore - x.overlapScore || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  return out;
}
