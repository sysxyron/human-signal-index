// =============================================================================
// @hsi/causal-intelligence — causal chains.
//
// buildCausalChains orders detected events into explainable sequences. The
// canonical GROWTH chain links the drivers that typically precede expansion:
//   influence_transfer → source_expansion → signal_surge → community_growth →
//   amplification_spike → contradiction_drop
// and the canonical DECLINE chain links the drivers of contraction:
//   contradiction_rise → amplification_drop(forecast_shift→declining) → signal fall.
//
// Each chain lists the ACTUAL member events in its summary (no black box). The
// chain confidence is the mean member confidence scaled by a temporal-coherence
// factor (how tightly the members cluster in time). Pure & deterministic.
// =============================================================================

import type { CausalChain, CausalEvent, CausalEventType, CausalInput } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Causal precedence used to order events within a chain. */
const PRECEDENCE: CausalEventType[] = [
  'influence_transfer',
  'source_expansion',
  'signal_surge',
  'community_growth',
  'amplification_spike',
  'contradiction_drop',
  'contradiction_rise',
  'forecast_shift',
];

/** Event types that drive GROWTH. */
const GROWTH_TYPES = new Set<CausalEventType>([
  'influence_transfer',
  'source_expansion',
  'signal_surge',
  'community_growth',
  'amplification_spike',
  'contradiction_drop',
]);

/** Event types that drive DECLINE. */
const DECLINE_TYPES = new Set<CausalEventType>([
  'contradiction_rise',
]);

function round(n: number, dp = 3): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function orderEvents(events: CausalEvent[]): CausalEvent[] {
  return [...events].sort(
    (a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      PRECEDENCE.indexOf(a.eventType) - PRECEDENCE.indexOf(b.eventType),
  );
}

/**
 * Temporal coherence: 1.0 when all members fall inside a tight window, decaying
 * toward 0.5 as the span widens (events spread across a long time are a weaker
 * single causal story). 1.0 for a single event.
 */
function coherence(events: CausalEvent[], windowDays: number): number {
  if (events.length < 2) return 1;
  const times = events.map((e) => Date.parse(e.occurredAt));
  const span = (Math.max(...times) - Math.min(...times)) / DAY_MS;
  if (span <= 0) return 1;
  // Within `windowDays` → ~1.0; far beyond → floor 0.5.
  return clamp01(0.5 + 0.5 * (windowDays / (windowDays + span)));
}

function chainConfidence(events: CausalEvent[], windowDays: number): number {
  if (events.length === 0) return 0;
  const mean =
    events.reduce((acc, e) => acc + e.confidence, 0) / events.length;
  return round(clamp01(mean * coherence(events, windowDays)));
}

function summarize(name: string, events: CausalEvent[]): string {
  if (events.length === 0) return `${name}: no qualifying events`;
  const parts = events.map((e) => e.explanation);
  return `${name}: ${parts.join(' → ')}`;
}

function makeChain(
  input: CausalInput,
  chainName: string,
  events: CausalEvent[],
  windowDays: number,
): CausalChain {
  const ordered = orderEvents(events);
  return {
    id: `chain_${input.narrativeId}_${chainName.replace(/\s+/g, '-').toLowerCase()}`,
    narrativeId: input.narrativeId,
    chainName,
    confidence: chainConfidence(ordered, windowDays),
    summary: summarize(chainName, ordered),
    events: ordered,
    createdAt: input.now,
  };
}

/**
 * Build the causal chains for a narrative. Returns a canonical "growth cause"
 * chain and/or "decline cause" chain when the corresponding driver events are
 * present. Deterministic; chains are returned growth-first.
 */
export function buildCausalChains(
  events: CausalEvent[],
  input: CausalInput,
): CausalChain[] {
  // Window over which we consider events to belong to one story = the snapshot
  // span (oldest → newest), so coherence is grounded in the actual history.
  const times = input.snapshots.map((s) => Date.parse(s.capturedAt));
  const windowDays =
    times.length >= 2
      ? Math.max(1, (Math.max(...times) - Math.min(...times)) / DAY_MS)
      : 7;

  const chains: CausalChain[] = [];

  const growthEvents = events.filter((e) => GROWTH_TYPES.has(e.eventType));
  if (growthEvents.length > 0) {
    chains.push(makeChain(input, 'Growth cause', growthEvents, windowDays));
  }

  // Decline story: explicit contradiction_rise, plus any forecast_shift that
  // moved toward a worse state (declining/dead) — grounded in the event metric.
  const declineEvents = events.filter(
    (e) =>
      DECLINE_TYPES.has(e.eventType) ||
      (e.eventType === 'forecast_shift' &&
        (e.metrics.toState === 'declining' || e.metrics.toState === 'dead')),
  );
  if (declineEvents.length > 0) {
    chains.push(makeChain(input, 'Decline cause', declineEvents, windowDays));
  }

  return chains;
}
