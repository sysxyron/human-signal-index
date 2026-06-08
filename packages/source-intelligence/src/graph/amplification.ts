// =============================================================================
// @hsi/source-intelligence — narrative amplification scoring (Phase 9).
//
// computeAmplificationScores rates how strongly each narrative is being
// AMPLIFIED across PUBLIC signals. Amplification (0..100) rises with:
//   * source breadth   — distinct sources carrying the narrative,
//   * signal volume     — total signals in the narrative,
//   * recent velocity   — signals concentrated near `now` (recency-weighted),
//   * amplifies-edges   — inbound 'amplifies' edges (other narratives boosting it).
//
// Every score carries an explainable `rationale`. Pure & deterministic — the
// caller injects `now`; no Date.now()/Math.random(). This is a TRIAGE aid for
// human review, never a verdict and never auto-actioned.
// =============================================================================

import { clamp, round } from '../internal/text';

export interface AmplificationNarrative {
  id: string;
  label: string;
  signalIds: string[];
}

export interface AmplificationSignal {
  id: string;
  sourceId?: string;
  /** ISO capture time — drives recency/velocity. */
  capturedAt?: string;
  /** Optional reach/engagement weighting (>=0). */
  reach?: number;
}

export interface AmplificationEdge {
  source: string;
  target: string;
  edgeType: string;
  weight?: number;
}

export interface AmplificationInput {
  narratives: AmplificationNarrative[];
  signals: AmplificationSignal[];
  edges?: AmplificationEdge[];
}

export interface AmplificationScore {
  narrativeId: string;
  /** 0..100 composite amplification. */
  amplification: number;
  sourceCount: number;
  signalCount: number;
  /** 0..1 recency-weighted velocity (1 = all signals at `now`). */
  velocity: number;
  rationale: string;
}

export interface AmplificationResult {
  scores: AmplificationScore[];
}

/** Recency half-life in days: a signal this old contributes ~0.5 velocity. */
export const VELOCITY_HALF_LIFE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Recency weight in (0,1]: 1 at `now`, decaying by an exponential half-life. */
function recencyWeight(capturedAt: string | undefined, nowMs: number): number {
  if (!capturedAt) return 0.3; // unknown time → modest weight (uncertainty)
  const t = Date.parse(capturedAt);
  if (Number.isNaN(t)) return 0.3;
  const ageDays = Math.max(0, (nowMs - t) / DAY_MS);
  return Math.pow(0.5, ageDays / VELOCITY_HALF_LIFE_DAYS);
}

/**
 * Compute amplification scores for each narrative. Deterministic; never throws.
 */
export function computeAmplificationScores(
  input: AmplificationInput,
  now: string = '1970-01-01T00:00:00.000Z',
): AmplificationResult {
  const nowMs = Date.parse(now);
  const signalById = new Map(input.signals.map((s) => [s.id, s]));

  // Inbound amplifies-edge weight per narrative (other narratives boosting it).
  const inboundAmp = new Map<string, number>();
  for (const e of input.edges ?? []) {
    if (e.edgeType !== 'amplifies') continue;
    inboundAmp.set(e.target, (inboundAmp.get(e.target) ?? 0) + (e.weight ?? 0.5));
  }

  const scores: AmplificationScore[] = input.narratives.map((n) => {
    const sigs = n.signalIds.map((id) => signalById.get(id)).filter((s): s is AmplificationSignal => Boolean(s));
    const signalCount = sigs.length;
    const sources = new Set<string>();
    for (const s of sigs) if (s.sourceId) sources.add(s.sourceId);
    const sourceCount = sources.size;

    // Velocity: mean recency weight across signals (0..1).
    let velSum = 0;
    let reachSum = 0;
    for (const s of sigs) {
      velSum += recencyWeight(s.capturedAt, nowMs);
      reachSum += Math.max(0, s.reach ?? 0);
    }
    const velocity = signalCount > 0 ? round(velSum / signalCount) : 0;

    const ampEdgeBoost = inboundAmp.get(n.id) ?? 0;

    // Composite (each sub-term saturates so no single factor dominates):
    //   sources (0..30) + volume (0..25) + velocity (0..25) +
    //   amplifies-edges (0..12) + reach (0..8).
    const sourceTerm = clamp(sourceCount / 5, 0, 1) * 30;
    const volumeTerm = clamp(signalCount / 8, 0, 1) * 25;
    const velocityTerm = velocity * 25;
    const edgeTerm = clamp(ampEdgeBoost / 2, 0, 1) * 12;
    const reachTerm = clamp(reachSum / 10000, 0, 1) * 8;
    const amplification = round(
      clamp(sourceTerm + volumeTerm + velocityTerm + edgeTerm + reachTerm, 0, 100),
    );

    const rationale =
      `"${n.label}" amplification ${amplification}/100: ` +
      `${sourceCount} distinct source(s), ${signalCount} signal(s), ` +
      `velocity ${velocity} (recency-weighted, ${VELOCITY_HALF_LIFE_DAYS}d half-life)` +
      (ampEdgeBoost > 0 ? `, +${round(ampEdgeBoost)} inbound amplifies-edge weight` : '') +
      (reachSum > 0 ? `, total reach ~${Math.round(reachSum)}` : '') + '.';

    return { narrativeId: n.id, amplification, sourceCount, signalCount, velocity, rationale };
  });

  // Deterministic ordering: highest amplification first, ties by id.
  scores.sort((a, b) => b.amplification - a.amplification || a.narrativeId.localeCompare(b.narrativeId));
  return { scores };
}
