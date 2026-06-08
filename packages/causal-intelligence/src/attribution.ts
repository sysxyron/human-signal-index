// =============================================================================
// @hsi/causal-intelligence — change attribution.
//
// attributeChange ranks the detected events by impact (strength × confidence)
// and assigns each a % SHARE of the observed change. Shares are computed from
// the relative impact weights but are deliberately capped so they sum to ≤ 100:
// a residual "unexplained" share is ALWAYS left when total coverage confidence
// is < 1, and is labeled. We NEVER force 100% — honesty over false precision.
//
// primaryCauses     — events whose share ≥ PRIMARY_SHARE_MIN (sorted desc).
// contributingCauses— the remaining qualifying events (share > 0).
// growthAttribution — [{ eventType, share }] summed per event type, share %.
// =============================================================================

import type { CausalEvent, CausalEventType, CausalInput } from './types';

// ---- Documented thresholds --------------------------------------------------
/** A cause with at least this % share is "primary". */
export const PRIMARY_SHARE_MIN = 20;
/**
 * Maximum total explained share. The residual (100 - coverage) is reported as
 * "unexplained" so the engine never claims to fully account for the change.
 */
export const MAX_EXPLAINED = 92;

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function impact(e: CausalEvent): number {
  return e.eventStrength * e.confidence;
}

export interface ChangeAttribution {
  primaryCauses: CausalEvent[];
  contributingCauses: CausalEvent[];
  /** Per-event-type share of the explained change (%). Sums to ≤ MAX_EXPLAINED. */
  growthAttribution: { eventType: CausalEventType; share: number }[];
  /** The unexplained residual share (%), always reported, never forced to 0. */
  unexplained: number;
}

/**
 * Attribute the observed change to the detected events. Deterministic; ranked
 * by impact (strength × confidence) with stable tiebreaks.
 */
export function attributeChange(
  input: CausalInput,
  events: CausalEvent[],
): ChangeAttribution {
  void input; // input is part of the contract; coverage is event-driven.

  if (events.length === 0) {
    return {
      primaryCauses: [],
      contributingCauses: [],
      growthAttribution: [],
      unexplained: 100,
    };
  }

  // Sort by impact (desc), stable tiebreak by type precedence then time.
  const ranked = [...events].sort(
    (a, b) =>
      impact(b) - impact(a) ||
      a.eventType.localeCompare(b.eventType) ||
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );

  const totalImpact = ranked.reduce((acc, e) => acc + impact(e), 0);

  // Coverage: how confident are we, overall, that these events explain the
  // change? Mean confidence weighted by impact, capped by MAX_EXPLAINED. Thin
  // evidence (few/low-confidence events) → lower coverage → larger residual.
  const meanConf =
    totalImpact > 0
      ? ranked.reduce((acc, e) => acc + impact(e) * e.confidence, 0) / totalImpact
      : 0;
  const coverage = Math.min(MAX_EXPLAINED, round(MAX_EXPLAINED * meanConf, 1));

  // Distribute `coverage` across events proportional to impact.
  const perEvent = ranked.map((e) => ({
    event: e,
    share: totalImpact > 0 ? round((impact(e) / totalImpact) * coverage, 1) : 0,
  }));

  const primaryCauses = perEvent
    .filter((p) => p.share >= PRIMARY_SHARE_MIN)
    .map((p) => p.event);
  const contributingCauses = perEvent
    .filter((p) => p.share > 0 && p.share < PRIMARY_SHARE_MIN)
    .map((p) => p.event);

  // Aggregate share per event type (deterministic order by descending share).
  const byType = new Map<CausalEventType, number>();
  for (const p of perEvent) {
    byType.set(p.event.eventType, round((byType.get(p.event.eventType) ?? 0) + p.share, 1));
  }
  const growthAttribution = [...byType.entries()]
    .map(([eventType, share]) => ({ eventType, share }))
    .sort((a, b) => b.share - a.share || a.eventType.localeCompare(b.eventType));

  const explained = round(
    growthAttribution.reduce((acc, g) => acc + g.share, 0),
    1,
  );
  const unexplained = round(Math.max(0, 100 - explained), 1);

  return { primaryCauses, contributingCauses, growthAttribution, unexplained };
}
