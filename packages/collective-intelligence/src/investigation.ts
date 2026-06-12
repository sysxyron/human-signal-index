// =============================================================================
// @hsi/collective-intelligence — the INVESTIGATION lifecycle state machine.
//
// createInvestigation() starts a DRAFT; transitionInvestigation()/advanceInvestigation()
// apply validated, audited moves; updateInvestigation() edits the question/title
// while editable. Every transition appends an InvestigationEvent — NO silent
// failures, NO auto-advance.
//
// LIFECYCLE:
//   DRAFT → ACTIVE → UNDER_REVIEW → CONSENSUS_FORMING → PUBLISHED → ARCHIVED
//   with back-edges for revision (UNDER_REVIEW → ACTIVE, CONSENSUS_FORMING →
//   UNDER_REVIEW) and ARCHIVED reachable from most states. Reversible + governed.
// =============================================================================

import type {
  Investigation,
  InvestigationEvent,
  InvestigationInput,
  InvestigationPatch,
  InvestigationState,
  InvestigationTransitionResult,
  TransitionValidity,
} from './types';

/** The ordered happy path. */
export const INVESTIGATION_PIPELINE: InvestigationState[] = [
  'DRAFT',
  'ACTIVE',
  'UNDER_REVIEW',
  'CONSENSUS_FORMING',
  'PUBLISHED',
  'ARCHIVED',
];

/** The explicit allowed-transition map. */
export const INVESTIGATION_TRANSITIONS: Record<InvestigationState, InvestigationState[]> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['CONSENSUS_FORMING', 'ACTIVE', 'ARCHIVED'],
  CONSENSUS_FORMING: ['PUBLISHED', 'UNDER_REVIEW', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED', 'UNDER_REVIEW'],
  ARCHIVED: ['ACTIVE'],
};

/** States in which content (title/question) may be edited. */
export const EDITABLE_STATES: InvestigationState[] = ['DRAFT', 'ACTIVE'];

/** Is `to` a legal transition from `from`? Explainable verdict. */
export function validateInvestigationTransition(
  from: InvestigationState,
  to: InvestigationState,
): TransitionValidity {
  if (from === to) return { valid: false, reason: `Already in state '${from}'; no self-transition.` };
  const allowed = INVESTIGATION_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return { valid: true, reason: `'${from}' → '${to}' is permitted.` };
  return { valid: false, reason: `'${from}' → '${to}' is not permitted (allowed: ${allowed.join(', ') || 'none'}).` };
}

/** Create a DRAFT investigation with a genesis event. */
export function createInvestigation(
  input: InvestigationInput,
  opts: { now: string },
): Investigation {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    question: input.question,
    state: 'DRAFT',
    createdBy: input.createdBy,
    createdAt: opts.now,
    updatedAt: opts.now,
    events: [
      { investigationId: input.id, from: 'DRAFT', to: 'DRAFT', actor: input.createdBy, reason: 'Investigation created.', at: opts.now },
    ],
  };
}

/** Edit an investigation's title/question (DRAFT / ACTIVE only). Inputs not mutated. */
export function updateInvestigation(
  investigation: Investigation,
  patch: InvestigationPatch,
  opts: { now: string },
): { ok: true; investigation: Investigation } | { ok: false; error: string; reason: string } {
  if (!EDITABLE_STATES.includes(investigation.state)) {
    return { ok: false, error: 'NOT_EDITABLE', reason: `Cannot edit a '${investigation.state}' investigation; only DRAFT / ACTIVE are editable.` };
  }
  return {
    ok: true,
    investigation: {
      ...investigation,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.question !== undefined ? { question: patch.question } : {}),
      updatedAt: opts.now,
    },
  };
}

/** Apply an explicit transition. Validated + audited. NEVER throws / silently no-ops. */
export function transitionInvestigation(
  investigation: Investigation,
  to: InvestigationState,
  opts: { now: string; actor?: string; reason?: string },
): InvestigationTransitionResult {
  const verdict = validateInvestigationTransition(investigation.state, to);
  if (!verdict.valid) return { ok: false, error: 'INVALID_TRANSITION', reason: verdict.reason };
  const event: InvestigationEvent = {
    investigationId: investigation.id,
    from: investigation.state,
    to,
    actor: opts.actor ?? 'curator',
    reason: opts.reason ?? verdict.reason,
    at: opts.now,
  };
  return {
    ok: true,
    investigation: { ...investigation, state: to, updatedAt: opts.now, events: [...investigation.events, event] },
    event,
  };
}

/** Advance to the next pipeline state. ok:false if terminal/off-pipeline. */
export function advanceInvestigation(
  investigation: Investigation,
  opts: { now: string; actor?: string; reason?: string },
): InvestigationTransitionResult {
  const idx = INVESTIGATION_PIPELINE.indexOf(investigation.state);
  const next = idx >= 0 && idx < INVESTIGATION_PIPELINE.length - 1 ? INVESTIGATION_PIPELINE[idx + 1] : null;
  if (!next) {
    return { ok: false, error: 'NO_NEXT_STATE', reason: `State '${investigation.state}' has no next pipeline state.` };
  }
  return transitionInvestigation(investigation, next, { ...opts, reason: opts.reason ?? `Advance ${investigation.state} → ${next}.` });
}

/** Pipeline progress 0..1. */
export function investigationProgress(state: InvestigationState): number {
  const idx = INVESTIGATION_PIPELINE.indexOf(state);
  return idx >= 0 ? Math.round((idx / (INVESTIGATION_PIPELINE.length - 1)) * 100) / 100 : 0;
}
