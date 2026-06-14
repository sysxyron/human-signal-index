// =============================================================================
// Investigation workflow — lifecycle state machine + timeline + publication
// readiness. Every state change is validated and produces an auditable event;
// there are NO silent transitions. This engine moves WORKFLOW state only — it
// never publishes content, approves governance, or assigns RBAC roles.
// =============================================================================

import type {
  InvestigationEvent, InvestigationStatus, PublicationReadiness,
} from './types';

export const INVESTIGATION_ORDER: InvestigationStatus[] = [
  'intake',
  'research',
  'evidence_collection',
  'review',
  'escalated',
  'governance',
  'publication_ready',
  'published',
  'archived',
];

/**
 * Allowed transitions. Forward through the pipeline, with rework (back one
 * stage), escalation (from research/evidence/review/governance), and archival
 * from most stages. published → archived. archived is terminal.
 */
export const INVESTIGATION_TRANSITIONS: Record<InvestigationStatus, InvestigationStatus[]> = {
  intake: ['research', 'archived'],
  research: ['evidence_collection', 'intake', 'escalated', 'archived'],
  evidence_collection: ['review', 'research', 'escalated', 'archived'],
  review: ['governance', 'publication_ready', 'evidence_collection', 'escalated', 'archived'],
  escalated: ['governance', 'research', 'review', 'archived'],
  governance: ['publication_ready', 'review', 'escalated', 'archived'],
  publication_ready: ['published', 'review', 'archived'],
  published: ['archived'],
  archived: [],
};

export function isTerminalStatus(status: InvestigationStatus): boolean {
  return INVESTIGATION_TRANSITIONS[status].length === 0;
}

export function canTransition(from: InvestigationStatus, to: InvestigationStatus): boolean {
  return INVESTIGATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: InvestigationStatus): InvestigationStatus[] {
  return [...INVESTIGATION_TRANSITIONS[from]];
}

export type TransitionResult =
  | { ok: true; status: InvestigationStatus; event: InvestigationEvent }
  | { ok: false; reason: string };

/**
 * Validate + record a transition. Requires an actor and a non-blank reason
 * (no silent state changes). Returns the new status + auditable event.
 */
export function transitionInvestigation(
  from: InvestigationStatus,
  to: InvestigationStatus,
  input: { actor: string; reason: string; metadata?: Record<string, unknown> },
  opts: { now: string },
): TransitionResult {
  if (!input.actor || input.actor.trim().length === 0) {
    return { ok: false, reason: 'A transition requires an identified actor.' };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, reason: 'A transition requires a non-blank reason.' };
  }
  if (from === to) return { ok: false, reason: `Already in '${from}'.` };
  if (!canTransition(from, to)) return { ok: false, reason: `Transition ${from} → ${to} is not allowed.` };
  return {
    ok: true,
    status: to,
    event: { action: `status:${from}->${to}`, actor: input.actor.trim(), reason: input.reason.trim(), at: opts.now, metadata: input.metadata },
  };
}

/** Progress 0..1 along the canonical order. */
export function investigationProgress(status: InvestigationStatus): number {
  const idx = INVESTIGATION_ORDER.indexOf(status);
  if (idx < 0) return 0;
  return Math.round((idx / (INVESTIGATION_ORDER.length - 1)) * 100) / 100;
}

/** Sort events oldest→newest (timeline). Pure; does not mutate input. */
export function buildInvestigationTimeline(events: InvestigationEvent[]): InvestigationEvent[] {
  return [...events].sort((a, b) => a.at.localeCompare(b.at));
}

/** Is the investigation ready to publish per the read-only checklist? */
export function isPublicationReady(r: PublicationReadiness): boolean {
  return (
    r.evidenceComplete &&
    r.reviewerComplete &&
    r.governanceComplete &&
    r.riskAssessed &&
    r.traceabilitySufficient &&
    r.sourceQualitySufficient
  );
}

/** Human-readable checklist rows (label + ok), in display order. */
export function readinessChecklist(r: PublicationReadiness): Array<{ label: string; ok: boolean }> {
  return [
    { label: 'Evidence complete', ok: r.evidenceComplete },
    { label: 'Reviewer complete', ok: r.reviewerComplete },
    { label: 'Governance complete', ok: r.governanceComplete },
    { label: 'Risk assessed', ok: r.riskAssessed },
    { label: 'Traceability sufficient', ok: r.traceabilitySufficient },
    { label: 'Source quality sufficient', ok: r.sourceQualitySufficient },
  ];
}
