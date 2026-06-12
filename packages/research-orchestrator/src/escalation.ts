// =============================================================================
// @hsi/research-orchestrator — the ESCALATION engine.
//
// escalateResearchIssue() turns an operational problem into an EscalationRecord
// for a HUMAN. Triggers: repeated failures, trust collapse, calibration drift,
// missing evidence, governance backlog, queue blockage. Each record carries a
// severity, the evidence, and an advisory recommendation. Escalations are NEVER
// auto-resolved and NEVER auto-acted — they are surfaced in the operations center.
// Deterministic; inputs not mutated.
// =============================================================================

import type {
  EscalationRecord,
  EscalationSeverity,
  EscalationTrigger,
} from './types';

/** Default severity per trigger. */
const TRIGGER_SEVERITY: Record<EscalationTrigger, EscalationSeverity> = {
  trust_collapse: 'CRITICAL',
  repeated_failures: 'HIGH',
  calibration_drift: 'HIGH',
  queue_blockage: 'HIGH',
  missing_evidence: 'WARNING',
  governance_backlog: 'WARNING',
};

const TRIGGER_REASON: Record<EscalationTrigger, string> = {
  repeated_failures: 'A research run failed repeatedly past its retry budget.',
  trust_collapse: 'Trust collapsed for an entity this run depends on.',
  calibration_drift: 'Calibration drifted beyond the acceptable threshold.',
  missing_evidence: 'Required evidence is missing for this stage.',
  governance_backlog: 'Governance decisions are backing up.',
  queue_blockage: 'The research queue is blocked — items are not draining.',
};

const TRIGGER_RECOMMENDATION: Record<EscalationTrigger, string> = {
  repeated_failures: 'Investigate the failing stage; retry manually or reroute the workflow. Do not auto-retry indefinitely.',
  trust_collapse: 'Route to trust governance and open a recalibration proposal before relying on this run.',
  calibration_drift: 'Review calibration and consider a recalibration proposal; pause dependent decisions.',
  missing_evidence: 'Re-run the evidence stage or reassign the evidence agent before proceeding.',
  governance_backlog: 'Allocate reviewer capacity; prioritise the oldest pending decisions.',
  queue_blockage: 'Inspect stuck items, rebalance agents, and clear blocked tasks. Consider raising priority.',
};

/**
 * Raise an escalation. The severity defaults from the trigger but can be
 * overridden; the reason/recommendation/evidence are explainable. Status starts
 * `open` (never auto-resolved). Deterministic — pass `now` via opts.
 */
export function escalateResearchIssue(
  input: {
    id: string;
    trigger: EscalationTrigger;
    runId?: string;
    severity?: EscalationSeverity;
    reason?: string;
    evidence?: string[];
    recommendation?: string;
  },
  opts: { now: string },
): EscalationRecord {
  return {
    id: input.id,
    ...(input.runId ? { runId: input.runId } : {}),
    trigger: input.trigger,
    severity: input.severity ?? TRIGGER_SEVERITY[input.trigger],
    reason: (input.reason ?? TRIGGER_REASON[input.trigger]).trim(),
    evidence: input.evidence && input.evidence.length > 0 ? input.evidence.slice() : [],
    recommendation: (input.recommendation ?? TRIGGER_RECOMMENDATION[input.trigger]).trim(),
    createdAt: opts.now,
    status: 'open',
  };
}

/** Order escalations by severity (CRITICAL first) then recency. */
export function orderEscalations(records: EscalationRecord[]): EscalationRecord[] {
  const rank: Record<EscalationSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    WARNING: 2,
    INFO: 3,
  };
  return records
    .slice()
    .sort(
      (a, b) =>
        rank[a.severity] - rank[b.severity] ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id),
    );
}
