// =============================================================================
// @hsi/temporal-intelligence — narrative genealogy ("family tree of ideas").
//
// For each ORDERED narrative pair (A earlier, B later by firstSeenAt) we compute
// shared entities, shared sources, semantic similarity (injected embed or
// localLexicalEmbed fallback over name+category), and contradiction cues, then
// THRESHOLD-GATE a relationship. Pure & deterministic; no spurious edges.
//
// RULES (first match wins per directed pair A→B, A earlier than B):
//   contradicts  — high lexical/semantic overlap (similarity ≥ CONTRADICT_SIM)
//                  AND a contradiction marker present in B's text relative to A
//                  ("not", "debunk", "false", "myth", "refute", "hoax", …).
//                  Symmetric in spirit but emitted A(parent)→B(child).
//   merged_from  — B's text/entities/sources draw from ≥2 distinct earlier
//                  parents (handled at the set level): if B shares entities/
//                  sources with A AND with ≥1 other earlier narrative, and B's
//                  similarity to A ≥ MERGE_SIM. (Detected via mergeParents map.)
//   amplifies    — B reuses AND intensifies A: shares sources with A
//                  (sharedSources ≥ 1), similarity ≥ AMP_SIM, and B carries
//                  amplification cues ("surge", "spike", "viral", "spreading",
//                  "everywhere", …) — B pushes A's terms harder. Checked before
//                  split: explicit cues outrank a structural subset.
//   split_from   — B is a diverging SUBSET of A: B newer, similarity ≥ SPLIT_SIM,
//                  shares entities/sources with A, but B's entity set is a near
//                  subset of A's (|B∩A|/|B| ≥ SPLIT_SUBSET) and B is STRICTLY
//                  smaller (equal-size continuations are derived_from, not split).
//   derived_from — the general case: B later, similarity ≥ DERIVE_SIM, with
//                  shared entities OR shared sources from A.
//
// confidence blends similarity, shared-entity/source counts, and time gap.
// =============================================================================

import { localLexicalEmbed, tokenize } from '@hsi/source-intelligence';

/**
 * Cosine similarity of two equal-length vectors mapped from [-1,1] to [0,1].
 * Local + pure (mirrors source-intelligence's internal cosine01) so this package
 * keeps ZERO runtime deps. Returns 0 for empty/mismatched/zero vectors (no NaN).
 */
function cosine01(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.min(1, Math.max(0, (cos + 1) / 2));
}

import type {
  GenealogyEdge,
  GenealogyRelationship,
  NarrativeInput,
  SignalInput,
  TemporalDeps,
} from './types';

// ---- Documented thresholds --------------------------------------------------
export const DERIVE_SIM = 0.55;
export const SPLIT_SIM = 0.6;
export const MERGE_SIM = 0.55;
export const AMP_SIM = 0.5;
export const CONTRADICT_SIM = 0.5;
/** |B∩A| / |B| entity overlap that makes B a "subset" of A (split). */
export const SPLIT_SUBSET = 0.6;

const CONTRADICTION_MARKERS = [
  'not',
  'no',
  'false',
  'debunk',
  'debunked',
  'myth',
  'refute',
  'refuted',
  'hoax',
  'fake',
  'wrong',
  'deny',
  'denied',
  'disproven',
  'misleading',
];

const AMPLIFY_MARKERS = [
  'surge',
  'surging',
  'spike',
  'viral',
  'spreading',
  'spread',
  'everywhere',
  'explode',
  'exploding',
  'soaring',
  'skyrocket',
  'trending',
  'massive',
];

function round(n: number, dp = 3): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function timeMs(t: string | undefined): number {
  if (!t) return Number.NaN;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? Number.NaN : ms;
}

function narrativeText(n: NarrativeInput, signals: SignalInput[]): string {
  const owned = signals.filter(
    (s) => n.signalIds.includes(s.id) || s.narrativeId === n.id,
  );
  const sigText = owned
    .map((s) => `${s.title ?? ''} ${s.bodyText ?? ''}`)
    .join(' ');
  return `${n.name} ${n.category ?? ''} ${sigText}`.trim();
}

function sourcesOf(n: NarrativeInput, signals: SignalInput[]): Set<string> {
  const set = new Set<string>(n.sourceIds ?? []);
  const owned = signals.filter(
    (s) => n.signalIds.includes(s.id) || s.narrativeId === n.id,
  );
  for (const s of owned) if (s.sourceId) set.add(s.sourceId);
  return set;
}

function entitiesOf(n: NarrativeInput, signals: SignalInput[]): Set<string> {
  const set = new Set<string>(n.entityIds ?? []);
  const owned = signals.filter(
    (s) => n.signalIds.includes(s.id) || s.narrativeId === n.id,
  );
  for (const s of owned) for (const e of s.entityIds ?? []) set.add(e);
  return set;
}

function intersectSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

function hasMarker(text: string, markers: string[]): boolean {
  const toks = new Set(tokenize(text));
  return markers.some((m) => toks.has(m));
}

/**
 * Build the narrative genealogy graph. Deterministic & threshold-gated.
 * Returns edges sorted by (parent, child, relationship) for stable output.
 */
export async function buildNarrativeGenealogy(
  narratives: NarrativeInput[],
  signals: SignalInput[],
  deps: TemporalDeps,
): Promise<GenealogyEdge[]> {
  const texts = narratives.map((n) => narrativeText(n, signals));
  const embeds = deps.embed
    ? await deps.embed(texts)
    : localLexicalEmbed(texts);

  const idx = new Map(narratives.map((n, i) => [n.id, i]));
  const sourcesByN = new Map(narratives.map((n) => [n.id, sourcesOf(n, signals)]));
  const entitiesByN = new Map(narratives.map((n) => [n.id, entitiesOf(n, signals)]));

  // First pass: which later narratives draw from ≥2 distinct earlier parents
  // (with shared entities/sources + similarity ≥ MERGE_SIM) → merge candidates.
  const mergeParents = new Map<string, string[]>();
  for (const child of narratives) {
    const ct = timeMs(child.firstSeenAt);
    const parents: string[] = [];
    for (const parent of narratives) {
      if (parent.id === child.id) continue;
      const pt = timeMs(parent.firstSeenAt);
      if (Number.isNaN(pt) || Number.isNaN(ct) || pt >= ct) continue;
      const sim = cosine01(embeds[idx.get(parent.id)!], embeds[idx.get(child.id)!]);
      const se = intersectSize(entitiesByN.get(parent.id)!, entitiesByN.get(child.id)!);
      const ss = intersectSize(sourcesByN.get(parent.id)!, sourcesByN.get(child.id)!);
      if (sim >= MERGE_SIM && (se > 0 || ss > 0)) parents.push(parent.id);
    }
    if (parents.length >= 2) mergeParents.set(child.id, parents.sort());
  }

  const edges: GenealogyEdge[] = [];

  for (const parent of narratives) {
    for (const child of narratives) {
      if (parent.id === child.id) continue;
      const pt = timeMs(parent.firstSeenAt);
      const ct = timeMs(child.firstSeenAt);
      // Require strict time ordering: parent earlier than child.
      if (Number.isNaN(pt) || Number.isNaN(ct) || pt >= ct) continue;

      const pEnt = entitiesByN.get(parent.id)!;
      const cEnt = entitiesByN.get(child.id)!;
      const pSrc = sourcesByN.get(parent.id)!;
      const cSrc = sourcesByN.get(child.id)!;
      const sharedEntities = intersectSize(pEnt, cEnt);
      const sharedSources = intersectSize(pSrc, cSrc);
      const similarity = round(
        cosine01(embeds[idx.get(parent.id)!], embeds[idx.get(child.id)!]),
      );

      const childText = narrativeText(child, signals);
      const hasContradiction = hasMarker(childText, CONTRADICTION_MARKERS);
      const hasAmplify = hasMarker(childText, AMPLIFY_MARKERS);

      // Time-gap factor for confidence: closer in time → stronger lineage.
      const gapDays = (ct - pt) / (24 * 60 * 60 * 1000);
      const gapFactor = clamp01(1 - gapDays / 60); // ~2 month decay

      let relationship: GenealogyRelationship | null = null;
      let rationale = '';

      const subsetRatio =
        cEnt.size > 0 ? intersectSize(cEnt, pEnt) / cEnt.size : 0;

      if (
        similarity >= CONTRADICT_SIM &&
        hasContradiction &&
        (sharedEntities > 0 || sharedSources > 0)
      ) {
        relationship = 'contradicts';
        rationale =
          `"${child.name}" opposes "${parent.name}": similarity ${similarity}, ` +
          `${sharedEntities} shared entities, contradiction marker present.`;
      } else if (
        (mergeParents.get(child.id)?.includes(parent.id) ?? false) &&
        similarity >= MERGE_SIM
      ) {
        relationship = 'merged_from';
        const others = mergeParents.get(child.id)!.length;
        rationale =
          `"${child.name}" merges ${others} earlier narratives incl. "${parent.name}": ` +
          `similarity ${similarity}, ${sharedEntities} shared entities, ${sharedSources} shared sources.`;
      } else if (
        similarity >= AMP_SIM &&
        sharedSources >= 1 &&
        hasAmplify
      ) {
        // Amplify is checked before split: explicit intensification cues are a
        // stronger semantic signal than a structural entity-subset.
        relationship = 'amplifies';
        rationale =
          `"${child.name}" amplifies "${parent.name}": reuses ${sharedSources} sources ` +
          `with intensification cues, similarity ${similarity}.`;
      } else if (
        similarity >= SPLIT_SIM &&
        (sharedEntities > 0 || sharedSources > 0) &&
        subsetRatio >= SPLIT_SUBSET &&
        cEnt.size > 0 &&
        cEnt.size < pEnt.size
      ) {
        relationship = 'split_from';
        rationale =
          `"${child.name}" split from "${parent.name}": diverging subset ` +
          `(${Math.round(subsetRatio * 100)}% of its entities from parent), similarity ${similarity}.`;
      } else if (
        similarity >= DERIVE_SIM &&
        (sharedEntities > 0 || sharedSources > 0)
      ) {
        relationship = 'derived_from';
        rationale =
          `"${child.name}" derived from "${parent.name}": similarity ${similarity}, ` +
          `${sharedEntities} shared entities, ${sharedSources} shared sources.`;
      }

      if (!relationship) continue;

      // Confidence: similarity + shared-evidence + recency.
      const sharedFactor = clamp01(
        (Math.min(sharedEntities, 5) / 5) * 0.5 +
          (Math.min(sharedSources, 5) / 5) * 0.5,
      );
      const confidence = round(
        clamp01(similarity * 0.55 + sharedFactor * 0.3 + gapFactor * 0.15),
      );

      edges.push({
        parentNarrativeId: parent.id,
        childNarrativeId: child.id,
        relationship,
        confidence,
        sharedEntities,
        sharedSources,
        similarity,
        rationale,
        createdAt: deps.now,
      });
    }
  }

  edges.sort(
    (a, b) =>
      a.parentNarrativeId.localeCompare(b.parentNarrativeId) ||
      a.childNarrativeId.localeCompare(b.childNarrativeId) ||
      a.relationship.localeCompare(b.relationship),
  );
  return edges;
}
