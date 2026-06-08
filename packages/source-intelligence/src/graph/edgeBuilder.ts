// =============================================================================
// @hsi/source-intelligence — narrative EDGE builder (Phase 8).
//
// Derives explainable, weighted relationships between narrative nodes from the
// signals beneath them. Every edge is DETERMINISTIC and carries a `rationale`.
//
// Edge types (documented):
//   co_occurs_with : narratives whose signals share entities AND fall in the same
//                    capture time window (temporal + entity overlap).
//   related_to     : semantic (embed) or lexical similarity of node text above a
//                    threshold (the generic "these are about the same thing").
//   contradicts    : opposing-stance cues (negation/antonymic pairs) OR an
//                    antonymic category pairing (e.g. extinction vs civilization).
//   amplifies      : one narrative's signals repeat AND intensify another's terms
//                    (shared vocabulary + intensifier language).
//   evolves_into / derived_from : temporal drift across ordered signals
//                    (reuses detectNarrativeDrift) — A evolves_into B when B is a
//                    later drift of A; B derived_from A is the inverse.
//
// Embeddings are OPTIONAL (injected); with none we use the lexical similarity.
// Never throws — embedding failures degrade to lexical.
// =============================================================================

import { detectNarrativeDrift } from '../drift';
import { clamp, round, textSimilarity, tokenize, tokenSet } from '../internal/text';
import { cosine01 } from '../internal/vector';
import { extractEntities } from './entityExtractor';
import type { NarrativeEdge, NarrativeNode } from './types';
import type { SemanticDeps } from '../semantic/types';

export interface EdgeSignal {
  id: string;
  title: string;
  bodyText?: string;
  category?: string;
  capturedAt?: string;
}

/** related_to threshold for lexical similarity. */
export const RELATED_LEXICAL_THRESHOLD = 0.12;
/** related_to threshold for embedding cosine (cosine01 in [0,1]). */
export const RELATED_COSINE_THRESHOLD = 0.72;

/** Category pairs treated as antonymic (opposing framings) → contradicts cue. */
const ANTONYMIC_CATEGORIES: [string, string][] = [
  ['extinction', 'civilization'],
  ['collapse', 'civilization'],
  ['population', 'civilization'],
];

/** Stance/negation cues used for contradiction detection. */
const NEGATION_CUES = [
  'not', 'no', 'never', 'false', 'debunk', 'debunked', 'myth', 'wrong',
  'reject', 'rejects', 'oppose', 'opposes', 'deny', 'denies', 'refute',
  'refutes', 'contrary', 'disagree', 'hoax', 'misleading',
];
/** Intensifier cues used for amplification detection. */
const INTENSIFIER_CUES = [
  'urgent', 'emergency', 'imperative', 'inevitable', 'existential', 'crisis',
  'now', 'immediately', 'must', 'escalate', 'escalating', 'accelerate',
  'unavoidable', 'imminent', 'critical',
];

function nodeText(node: NarrativeNode, signalsById: Map<string, EdgeSignal>): string {
  const parts: string[] = [node.name];
  for (const id of node.signalIds) {
    const s = signalsById.get(id);
    if (s) parts.push(`${s.title}\n${s.bodyText ?? ''}`);
  }
  return parts.join('\n').trim();
}

function entitySetFor(node: NarrativeNode, signalsById: Map<string, EdgeSignal>): Set<string> {
  const out = new Set<string>();
  for (const e of extractEntities(nodeText(node, signalsById))) {
    out.add(e.name.toLowerCase());
  }
  return out;
}

function termCounts(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokenize(text)) {
    if (t.length < 3) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

function countCues(text: string, cues: string[]): number {
  const toks = new Set(tokenize(text));
  let n = 0;
  for (const c of cues) {
    if (c.includes(' ') ? text.toLowerCase().includes(c) : toks.has(c)) n += 1;
  }
  return n;
}

function earliestCapture(node: NarrativeNode, signalsById: Map<string, EdgeSignal>): string | undefined {
  const times = node.signalIds
    .map((id) => signalsById.get(id)?.capturedAt)
    .filter((t): t is string => Boolean(t))
    .sort();
  return times[0];
}

/**
 * Build explainable edges between the supplied narrative nodes. Deterministic;
 * never throws. Embeddings (if `deps.embed`) drive related_to; otherwise lexical.
 */
export async function buildNarrativeEdges(
  nodes: NarrativeNode[],
  signals: EdgeSignal[],
  deps: SemanticDeps = {},
): Promise<NarrativeEdge[]> {
  if (nodes.length < 2) return [];
  const signalsById = new Map(signals.map((s) => [s.id, s]));

  const texts = nodes.map((n) => nodeText(n, signalsById));
  const entitySets = nodes.map((n) => entitySetFor(n, signalsById));
  const captureTimes = nodes.map((n) => earliestCapture(n, signalsById));

  // Optional embeddings for related_to.
  let vectors: number[][] | null = null;
  if (deps.embed) {
    try {
      const v = await deps.embed(texts);
      if (Array.isArray(v) && v.length === nodes.length) vectors = v;
    } catch {
      vectors = null;
    }
  }

  const edges: NarrativeEdge[] = [];
  const pushEdge = (e: NarrativeEdge): void => {
    edges.push({ ...e, weight: round(clamp(e.weight, 0, 1)) });
  };

  // Pairwise (directed where meaningful; ordered i<j for symmetric types).
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];

      // --- related_to (semantic or lexical) --------------------------------
      const cosineScore = vectors ? cosine01(vectors[i] ?? [], vectors[j] ?? []) : 0;
      const lexScore = textSimilarity(texts[i], texts[j]);
      const useCosine = !!vectors;
      const relScore = useCosine ? cosineScore : lexScore;
      const relThreshold = useCosine ? RELATED_COSINE_THRESHOLD : RELATED_LEXICAL_THRESHOLD;
      if (relScore >= relThreshold) {
        pushEdge({
          sourceNarrativeId: a.id,
          targetNarrativeId: b.id,
          edgeType: 'related_to',
          weight: relScore,
          rationale:
            `Narratives "${a.name}" and "${b.name}" are related: ` +
            `${useCosine ? 'embedding cosine' : 'lexical similarity'} ${round(relScore)} ` +
            `≥ threshold ${relThreshold}.`,
        });
      }

      // --- co_occurs_with (shared entities + temporal window) --------------
      const shared = [...entitySets[i]].filter((e) => entitySets[j].has(e));
      if (shared.length > 0) {
        const ta = captureTimes[i];
        const tb = captureTimes[j];
        const sameWindow =
          !ta || !tb ? true : Math.abs(Date.parse(ta) - Date.parse(tb)) <= WINDOW_MS;
        if (sameWindow) {
          const weight = clamp(0.4 + 0.15 * shared.length, 0, 0.95);
          pushEdge({
            sourceNarrativeId: a.id,
            targetNarrativeId: b.id,
            edgeType: 'co_occurs_with',
            weight,
            rationale:
              `Narratives "${a.name}" and "${b.name}" co-occur: they share ` +
              `${shared.length} entit${shared.length === 1 ? 'y' : 'ies'} ` +
              `[${shared.slice(0, 4).join(', ')}]` +
              (ta && tb ? ` within the same capture window` : '') + '.',
          });
        }
      }

      // --- contradicts (antonymic categories OR negation-cue divergence) ---
      const antonymic = ANTONYMIC_CATEGORIES.some(
        ([x, y]) =>
          (a.category === x && b.category === y) || (a.category === y && b.category === x),
      );
      const negA = countCues(texts[i], NEGATION_CUES);
      const negB = countCues(texts[j], NEGATION_CUES);
      // Opposing stance: the two share topical vocabulary but one negates.
      const topicalOverlap = jaccardTokens(texts[i], texts[j]);
      const stanceDivergent = topicalOverlap >= 0.1 && Math.abs(negA - negB) >= 2;
      if (antonymic || stanceDivergent) {
        const weight = antonymic ? 0.7 : clamp(0.4 + 0.1 * Math.abs(negA - negB), 0, 0.85);
        pushEdge({
          sourceNarrativeId: a.id,
          targetNarrativeId: b.id,
          edgeType: 'contradicts',
          weight,
          rationale: antonymic
            ? `Narratives "${a.name}" (${a.category}) and "${b.name}" (${b.category}) ` +
              `occupy antonymic categories — opposing framings.`
            : `Narratives "${a.name}" and "${b.name}" share vocabulary (overlap ` +
              `${round(topicalOverlap)}) but diverge in stance cues ` +
              `(${negA} vs ${negB} negation/refutation cues).`,
        });
      }

      // --- amplifies (directed: shared terms + extra intensifiers) ---------
      const ampAB = amplification(texts[i], texts[j]);
      if (ampAB.amplifies) {
        pushEdge({
          sourceNarrativeId: a.id,
          targetNarrativeId: b.id,
          edgeType: 'amplifies',
          weight: ampAB.weight,
          rationale:
            `"${a.name}" amplifies "${b.name}": shares ${ampAB.sharedTerms} core term(s) ` +
            `and adds ${ampAB.extraIntensifiers} intensifier cue(s).`,
        });
      }
      const ampBA = amplification(texts[j], texts[i]);
      if (ampBA.amplifies) {
        pushEdge({
          sourceNarrativeId: b.id,
          targetNarrativeId: a.id,
          edgeType: 'amplifies',
          weight: ampBA.weight,
          rationale:
            `"${b.name}" amplifies "${a.name}": shares ${ampBA.sharedTerms} core term(s) ` +
            `and adds ${ampBA.extraIntensifiers} intensifier cue(s).`,
        });
      }

      // --- evolves_into / derived_from (temporal drift) --------------------
      const ta = captureTimes[i];
      const tb = captureTimes[j];
      if (ta && tb && ta !== tb) {
        // Order earlier → later, then test for drift between their texts.
        const [earlierIdx, laterIdx] = Date.parse(ta) <= Date.parse(tb) ? [i, j] : [j, i];
        const drift = detectNarrativeDrift(
          texts[earlierIdx],
          texts[laterIdx],
          captureTimes[laterIdx] ?? ta,
        );
        if (drift) {
          const earlier = nodes[earlierIdx];
          const later = nodes[laterIdx];
          pushEdge({
            sourceNarrativeId: earlier.id,
            targetNarrativeId: later.id,
            edgeType: 'evolves_into',
            weight: drift.driftScore,
            rationale:
              `"${earlier.name}" evolves into "${later.name}" over time: ` +
              `${drift.explanation}`,
          });
          pushEdge({
            sourceNarrativeId: later.id,
            targetNarrativeId: earlier.id,
            edgeType: 'derived_from',
            weight: drift.driftScore,
            rationale:
              `"${later.name}" is derived from the earlier "${earlier.name}" ` +
              `(temporal drift ${drift.driftScore}).`,
          });
        }
      }
    }
  }

  // Stable, deterministic ordering of edges.
  edges.sort(
    (x, y) =>
      x.sourceNarrativeId.localeCompare(y.sourceNarrativeId) ||
      x.targetNarrativeId.localeCompare(y.targetNarrativeId) ||
      x.edgeType.localeCompare(y.edgeType),
  );
  return edges;
}

/** Co-occurrence window: 30 days in ms (signals captured close in time). */
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function jaccardTokens(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Does `from` amplify `to`? Shared core terms + MORE intensifier cues. */
function amplification(
  from: string,
  to: string,
): { amplifies: boolean; weight: number; sharedTerms: number; extraIntensifiers: number } {
  const cf = termCounts(from);
  const ct = termCounts(to);
  let shared = 0;
  for (const k of ct.keys()) if (cf.has(k)) shared += 1;
  const intFrom = countCues(from, INTENSIFIER_CUES);
  const intTo = countCues(to, INTENSIFIER_CUES);
  const extra = intFrom - intTo;
  const amplifies = shared >= 3 && extra >= 1;
  const weight = amplifies ? clamp(0.4 + 0.05 * shared + 0.1 * extra, 0, 0.9) : 0;
  return { amplifies, weight, sharedTerms: shared, extraIntensifiers: Math.max(0, extra) };
}
