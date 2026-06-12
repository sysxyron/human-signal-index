// =============================================================================
// @hsi/research-orchestrator — AUTOMATED RESEARCH DISCOVERY.
//
// discoverResearchOpportunities() scans the platform's live signals — new signals,
// fresh evidence, open alerts, trust drift, outcome failures, narrative spikes —
// and PROPOSES research opportunities. It NEVER auto-publishes or auto-acts: each
// opportunity is `status: 'proposed'` for a human to triage. Deterministic; the
// confidence + priority are derived from the input weight + source. Inputs not
// mutated; opportunity ids are deterministic.
// =============================================================================

import type {
  DiscoveryInput,
  OpportunitySource,
  QueuePriority,
  ResearchOpportunity,
} from './types';

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Base urgency weight per source (drives priority). */
const SOURCE_URGENCY: Record<OpportunitySource, number> = {
  trust_drift: 0.85,
  outcome_failure: 0.8,
  alert: 0.7,
  narrative_spike: 0.6,
  signal: 0.5,
  evidence: 0.45,
};

const SOURCE_LABEL: Record<OpportunitySource, string> = {
  trust_drift: 'Trust drift',
  outcome_failure: 'Outcome failure',
  alert: 'Open alert',
  narrative_spike: 'Narrative spike',
  signal: 'New signal',
  evidence: 'Fresh evidence',
};

/** Map a 0..1 urgency to a queue priority. */
export function priorityForUrgency(urgency: number): QueuePriority {
  const u = clamp01(urgency);
  if (u >= 0.8) return 'CRITICAL';
  if (u >= 0.6) return 'HIGH';
  if (u >= 0.35) return 'NORMAL';
  return 'LOW';
}

/**
 * Discover (propose) research opportunities from a batch of discovery inputs.
 * Each input becomes one PROPOSED opportunity; the urgency = source base × the
 * input weight, mapping to priority + a 0..1 confidence. Sorted highest-priority
 * first. Deterministic — pass `now` via opts. NEVER auto-publishes.
 */
export function discoverResearchOpportunities(
  inputs: DiscoveryInput[],
  opts: { now: string; idPrefix?: string },
): ResearchOpportunity[] {
  const prefix = opts.idPrefix ?? 'opp';
  const out: ResearchOpportunity[] = inputs.map((input, i) => {
    const base = SOURCE_URGENCY[input.source];
    const weight = clamp01(input.weight ?? 0.5);
    const urgency = clamp01(base * (0.5 + weight)); // weight 0.5 → ~base
    const priority = priorityForUrgency(urgency);
    const title =
      input.title ??
      `${SOURCE_LABEL[input.source]}${input.entityId ? ` — ${input.entityId}` : ''}`;
    const reason =
      input.detail ??
      `${SOURCE_LABEL[input.source]} flagged${input.entityId ? ` for ${input.entityId}` : ''} ` +
        `with strength ${(weight * 100).toFixed(0)}% — worth an investigation.`;
    return {
      id: `${prefix}-${input.source}-${input.entityId ?? i}`,
      title,
      reason,
      confidence: Math.round(urgency * 100) / 100,
      priority,
      source: input.source,
      ...(input.entityId ? { entityId: input.entityId } : {}),
      createdAt: opts.now,
      status: 'proposed' as const,
    };
  });

  const rank: Record<QueuePriority, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  return out.sort(
    (a, b) => rank[a.priority] - rank[b.priority] || b.confidence - a.confidence || a.id.localeCompare(b.id),
  );
}
