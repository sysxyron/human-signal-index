// =============================================================================
// @hsi/causal-intelligence — narrative change explanation.
//
// explainNarrativeChange renders a human-readable, DATA-GROUNDED paragraph from
// the attributed causal events. Every clause references a real metric pulled
// from an event (e.g. "7 new sources began publishing", "+400%",
// "contradictions fell 30%→8%"). If the evidence is thin (few/low-confidence
// events) it SAYS SO and lowers confidence — it never invents a cause.
//
// factors[] enumerates each attributed cause with its grounding metric so the UI
// can render a breakdown. Pure & deterministic — caller injects `now`.
// =============================================================================

import { attributeChange } from './attribution';
import type {
  CausalChain,
  CausalEvent,
  CausalInput,
  ExplanationFactor,
  NarrativeChangeExplanation,
} from './types';

function round(n: number, dp = 1): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

/** Turn one event into a human clause grounded in its metrics. */
function clauseFor(e: CausalEvent): string {
  const m = e.metrics;
  switch (e.eventType) {
    case 'signal_surge':
      return `signal volume surged ${m.from}→${m.to} (+${m.deltaPct}%)`;
    case 'source_expansion':
      return `${m.delta} new source${m.delta === 1 ? '' : 's'} began publishing (${m.from}→${m.to})`;
    case 'community_growth':
      return `community participation grew ${m.from}→${m.to} (+${m.deltaPct}%)`;
    case 'amplification_spike':
      return `an amplification spike (${m.from}→${m.to}, +${m.delta})`;
    case 'contradiction_drop':
      return `contradiction rates fell ${m.from}%→${m.to}% (${m.deltaPts} pts)`;
    case 'contradiction_rise':
      return `contradiction rates rose ${m.from}%→${m.to}% (+${m.deltaPts} pts)`;
    case 'forecast_shift':
      return `the trajectory forecast shifted ${m.fromState} → ${m.toState}`;
    case 'influence_transfer':
      return `${m.source} amplified it (influence score ${m.influenceScore})`;
    default:
      return e.explanation;
  }
}

/** Pick the most representative metric number for a factor. */
function metricFor(e: CausalEvent): number | undefined {
  const m = e.metrics;
  const pick = (k: string): number | undefined =>
    typeof m[k] === 'number' ? (m[k] as number) : undefined;
  switch (e.eventType) {
    case 'signal_surge':
      return pick('deltaPct');
    case 'source_expansion':
      return pick('delta');
    case 'community_growth':
      return pick('deltaPct');
    case 'amplification_spike':
      return pick('delta');
    case 'contradiction_drop':
    case 'contradiction_rise':
      return pick('deltaPts');
    case 'influence_transfer':
      return pick('influenceScore');
    case 'forecast_shift':
      return pick('ordinalDistance');
    default:
      return undefined;
  }
}

const TYPE_LABEL: Record<CausalEvent['eventType'], string> = {
  signal_surge: 'Signal surge',
  source_expansion: 'Source expansion',
  community_growth: 'Community growth',
  amplification_spike: 'Amplification spike',
  contradiction_drop: 'Contradiction drop',
  contradiction_rise: 'Contradiction rise',
  forecast_shift: 'Forecast shift',
  influence_transfer: 'Influence transfer',
};

/**
 * Did the narrative, on balance, grow or decline over the window? Grounded in
 * the NET first→last signal change (the real end-to-end direction), not the sum
 * of step deltas (which can be positive even when a narrative peaks then dies).
 */
function netDirection(input: CausalInput): 'grew' | 'declined' | 'changed' {
  const snaps = [...input.snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  if (snaps.length >= 2) {
    const from = snaps[0].signalCount;
    const to = snaps[snaps.length - 1].signalCount;
    const netPct = ((to - from) / Math.max(1, from)) * 100;
    if (netPct > 10) return 'grew';
    if (netPct < -10) return 'declined';
  }
  return 'changed';
}

/**
 * Render a data-grounded explanation of why the narrative changed. Uses
 * attributeChange to rank/weight events, then composes a paragraph whose every
 * clause references a real metric. Thin data → explicit caveat + lower confidence.
 */
export function explainNarrativeChange(
  input: CausalInput,
  events: CausalEvent[],
  chains: CausalChain[],
): NarrativeChangeExplanation {
  const generatedAt = input.now;
  const direction = netDirection(input);

  // Net signal change for the headline (grounded in the first/last snapshot).
  const snaps = [...input.snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );
  let netPct: number | undefined;
  if (snaps.length >= 2) {
    const from = snaps[0].signalCount;
    const to = snaps[snaps.length - 1].signalCount;
    netPct = round(((to - from) / Math.max(1, from)) * 100, 0);
  }

  // --- Thin / no data: be honest, don't invent. ----------------------------
  if (events.length === 0) {
    const text =
      snaps.length < 2
        ? `Insufficient history to explain change for "${input.narrativeId}": ` +
          `only ${snaps.length} snapshot${snaps.length === 1 ? '' : 's'} available. No causal events could be grounded in the data.`
        : `No material causal events were detected for "${input.narrativeId}" across ${snaps.length} snapshots; ` +
          `the observed change is below detection thresholds. Treat as inconclusive.`;
    return {
      narrativeId: input.narrativeId,
      headline: `"${input.narrativeId}" — change inconclusive (thin evidence)`,
      text,
      factors: [],
      confidence: 0.2,
      generatedAt,
    };
  }

  const attribution = attributeChange(input, events);
  const primary = attribution.primaryCauses;
  const contributing = attribution.contributingCauses;

  // Build factors from ALL attributed events (primary first, then contributing).
  const ordered = [...primary, ...contributing];
  const factors: ExplanationFactor[] = ordered.map((e) => ({
    label: TYPE_LABEL[e.eventType],
    detail: e.explanation,
    metric: metricFor(e),
  }));

  // --- Compose the paragraph -----------------------------------------------
  const headPct =
    netPct !== undefined ? ` ${netPct >= 0 ? '+' : ''}${netPct}%` : '';
  const headline = `"${input.narrativeId}" ${direction}${headPct} — here is why`;

  // Direction-aware clause selection: a DECLINED narrative is explained by its
  // decline-aligned events (contradiction rises, forecast shifts toward worse
  // states); a GROWN narrative by its growth-aligned events. This keeps the
  // lead sentence honest — we never say "declined because signals surged".
  const alignsWithDirection = (e: CausalEvent): boolean => {
    if (direction === 'declined') {
      return (
        e.eventType === 'contradiction_rise' ||
        (e.eventType === 'forecast_shift' &&
          (e.metrics.toState === 'declining' || e.metrics.toState === 'dead'))
      );
    }
    if (direction === 'grew') {
      return e.eventType !== 'contradiction_rise';
    }
    return true;
  };

  const leadPrimary = primary.filter(alignsWithDirection);
  const leadContributing = contributing.filter(alignsWithDirection);
  const leadClauses = (leadPrimary.length > 0 ? leadPrimary : leadContributing).map(
    clauseFor,
  );
  const restClauses = ordered
    .filter((e) => !(leadPrimary.length > 0 ? leadPrimary : leadContributing).includes(e))
    .map(clauseFor);

  const sentences: string[] = [];
  if (leadClauses.length > 0 && leadPrimary.length > 0) {
    sentences.push(
      `"${input.narrativeId}" ${direction} primarily because ${joinClauses(leadClauses)}.`,
    );
  } else if (leadClauses.length > 0) {
    sentences.push(
      `"${input.narrativeId}" ${direction}; the change is spread across several drivers: ${joinClauses(leadClauses)}.`,
    );
  } else {
    sentences.push(
      `"${input.narrativeId}" ${direction}; no single dominant cause stands out among the detected events.`,
    );
  }
  if (restClauses.length > 0) {
    sentences.push(`Contributing factors: ${joinClauses(restClauses)}.`);
  }

  // Reference the canonical growth/decline chain summary if present.
  const growthChain = chains.find((c) => c.chainName === 'Growth cause');
  const declineChain = chains.find((c) => c.chainName === 'Decline cause');
  if (direction === 'grew' && growthChain && growthChain.events.length > 1) {
    sentences.push(
      `The driver sequence: ${growthChain.events.map((e) => e.eventType).join(' → ')}.`,
    );
  } else if (direction === 'declined' && declineChain && declineChain.events.length > 0) {
    sentences.push(
      `The decline sequence: ${declineChain.events.map((e) => e.eventType).join(' → ')}.`,
    );
  }

  // Honest residual + confidence.
  sentences.push(
    `~${attribution.unexplained}% of the change remains unexplained by detected events.`,
  );

  // Confidence: mean event confidence, reduced when evidence is thin.
  const meanConf =
    events.reduce((a, e) => a + e.confidence, 0) / events.length;
  const thin = events.length < 2 || snaps.length < 3;
  let confidence = round(Math.min(0.9, meanConf), 2);
  if (thin) {
    confidence = round(Math.min(confidence, 0.5), 2);
    sentences.push(
      `Note: evidence is thin (${events.length} event${events.length === 1 ? '' : 's'}, ${snaps.length} snapshot${snaps.length === 1 ? '' : 's'}) — treat this explanation as low-confidence.`,
    );
  }

  return {
    narrativeId: input.narrativeId,
    headline,
    text: sentences.join(' '),
    factors,
    confidence,
    generatedAt,
  };
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 0) return 'no detected causes';
  if (clauses.length === 1) return clauses[0];
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}
