// =============================================================================
// @hsi/source-intelligence — narrative clustering (Phase 8).
//
// Groups related signals into candidate NARRATIVES. With an injected `embed` fn
// we cluster by embedding cosine similarity; otherwise we fall back to the
// existing lexical shingle/Jaccard similarity (`textSimilarity`). Both paths are
// DETERMINISTIC: signals are processed in input order, ids break ties, and a
// single fixed similarity threshold drives a greedy connected-components style
// grouping (no random seeds, no clocks).
//
// Each cluster is a CANDIDATE narrative for the graph layer — a DRAFT, never an
// auto-published claim. Centroid terms make the grouping explainable.
// =============================================================================

import { round, textSimilarity, tokenize } from '../internal/text';
import { cosine01 } from '../internal/vector';
import type { SemanticDeps } from './types';

export interface ClusterSignal {
  id: string;
  title: string;
  bodyText?: string;
  category?: string;
}

export interface NarrativeCluster {
  id: string;
  label: string;
  signalIds: string[];
  category?: string;
  centroidTerms: string[];
}

export interface ClusterResult {
  clusters: NarrativeCluster[];
}

/** Below this pairwise similarity two signals are NOT in the same narrative. */
export const CLUSTER_SIMILARITY_THRESHOLD = 0.18;
/** Embedding-cosine clustering uses a higher floor (cosine01 is in [0,1]). */
export const CLUSTER_COSINE_THRESHOLD = 0.78;

function signalText(s: ClusterSignal): string {
  return `${s.title}\n${s.bodyText ?? ''}`.trim();
}

/**
 * Cluster signals into candidate narratives. Deterministic; never throws — any
 * embedding failure degrades to the lexical similarity path.
 */
export async function clusterNarratives(
  signals: ClusterSignal[],
  deps: SemanticDeps = {},
): Promise<ClusterResult> {
  if (signals.length === 0) return { clusters: [] };

  // Build a pairwise similarity function: embedding cosine when available, else
  // lexical text similarity. We precompute vectors once for the embedding path.
  let sim: (i: number, j: number) => number;
  let threshold = CLUSTER_SIMILARITY_THRESHOLD;

  let vectors: number[][] | null = null;
  if (deps.embed) {
    try {
      const v = await deps.embed(signals.map(signalText));
      if (Array.isArray(v) && v.length === signals.length) {
        vectors = v;
      }
    } catch {
      vectors = null; // graceful fallback to lexical below
    }
  }

  if (vectors) {
    threshold = CLUSTER_COSINE_THRESHOLD;
    const vv = vectors;
    sim = (i, j) => cosine01(vv[i] ?? [], vv[j] ?? []);
  } else {
    const texts = signals.map(signalText);
    sim = (i, j) => textSimilarity(texts[i], texts[j]);
  }

  // Greedy union-find style grouping in input order (deterministic). Each signal
  // joins the first existing cluster whose representative it is similar enough
  // to; otherwise it seeds a new cluster.
  const parent: number[] = signals.map((_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    let c = x;
    while (parent[c] !== c) {
      const next = parent[c];
      parent[c] = r;
      c = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Keep the lower index as root for stable, deterministic cluster ordering.
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  for (let i = 0; i < signals.length; i += 1) {
    for (let j = i + 1; j < signals.length; j += 1) {
      if (sim(i, j) >= threshold) union(i, j);
    }
  }

  // Collect members per root, preserving input order within each group.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < signals.length; i += 1) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  }

  // Emit clusters in order of their root index for determinism.
  const roots = [...groups.keys()].sort((a, b) => a - b);
  const clusters: NarrativeCluster[] = roots.map((root, idx) => {
    const members = groups.get(root) ?? [];
    const memberSignals = members.map((m) => signals[m]);
    const centroidTerms = computeCentroidTerms(memberSignals);
    const category = dominantCategory(memberSignals);
    const label = buildLabel(memberSignals, centroidTerms);
    return {
      id: `narr_${idx + 1}`,
      label,
      signalIds: memberSignals.map((s) => s.id),
      category,
      centroidTerms,
    };
  });

  return { clusters };
}

/** Stopwords kept tiny + neutral — just enough to surface meaningful terms. */
const STOPWORDS = new Set([
  'the', 'and', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be',
  'on', 'for', 'with', 'as', 'by', 'that', 'this', 'it', 'its', 'at', 'or',
  'from', 'we', 'our', 'their', 'they', 'has', 'have', 'had', 'not', 'but',
  'now', 'will', 'would', 'should', 'can', 'could', 'about', 'into', 'than',
]);

/** Top recurring content terms across a cluster's signals (explainability). */
function computeCentroidTerms(signals: ClusterSignal[], k = 6): string[] {
  const counts = new Map<string, number>();
  for (const s of signals) {
    for (const tok of tokenize(signalText(s))) {
      if (tok.length < 3 || STOPWORDS.has(tok)) continue;
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([term]) => term);
}

/** The most common non-empty category among members (deterministic ties). */
function dominantCategory(signals: ClusterSignal[]): string | undefined {
  const counts = new Map<string, number>();
  for (const s of signals) {
    if (s.category && s.category !== 'other') {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return signals.find((s) => s.category)?.category;
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** A short human label for the cluster: its category + leading centroid terms. */
function buildLabel(signals: ClusterSignal[], centroidTerms: string[]): string {
  const cat = dominantCategory(signals);
  const terms = centroidTerms.slice(0, 3).join(', ');
  if (cat && terms) return `${cat}: ${terms}`;
  if (terms) return terms;
  return signals[0]?.title ?? 'narrative';
}
