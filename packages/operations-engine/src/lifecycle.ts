// =============================================================================
// @hsi/operations-engine — investigation LIFECYCLE engine.
//
// Canonical order: SUBMITTED → TRIAGE → RESEARCH → EVIDENCE_COLLECTION → REVIEW →
// PUBLICATION_REVIEW → PUBLISHED → ARCHIVED. Transitions are validated and
// recorded; there are NO silent state changes. This engine moves OPERATIONAL
// state only — it never publishes content or makes a governance decision.
// =============================================================================

import type { LifecycleState, LifecycleTransition, TimelineEntry } from './types';

export const LIFECYCLE_ORDER: LifecycleState[] = [
  'SUBMITTED',
  'TRIAGE',
  'RESEARCH',
  'EVIDENCE_COLLECTION',
  'REVIEW',
  'PUBLICATION_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
];

/**
 * Allowed transitions. Forward one step is always allowed. A case may also be
 * sent back one stage for rework, archived from most stages, and PUBLISHED →
 * ARCHIVED. ARCHIVED is terminal.
 */
export const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  SUBMITTED: ['TRIAGE', 'ARCHIVED'],
  TRIAGE: ['RESEARCH', 'SUBMITTED', 'ARCHIVED'],
  RESEARCH: ['EVIDENCE_COLLECTION', 'TRIAGE', 'ARCHIVED'],
  EVIDENCE_COLLECTION: ['REVIEW', 'RESEARCH', 'ARCHIVED'],
  REVIEW: ['PUBLICATION_REVIEW', 'EVIDENCE_COLLECTION', 'ARCHIVED'],
  PUBLICATION_REVIEW: ['PUBLISHED', 'REVIEW', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

/** Is `state` terminal (no further transitions)? */
export function isTerminal(state: LifecycleState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/** Can a case move directly from `from` to `to`? */
export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class LifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LifecycleError';
  }
}

export type TransitionResult =
  | { ok: true; state: LifecycleState; transition: LifecycleTransition }
  | { ok: false; reason: string };

/**
 * Validate + record a lifecycle transition. Requires an actor and a non-blank
 * reason (no silent changes). Returns the new state + the auditable transition,
 * or { ok:false, reason } when the move is not allowed.
 */
export function transition(
  from: LifecycleState,
  to: LifecycleState,
  input: { actor: string; reason: string },
  opts: { now: string },
): TransitionResult {
  if (!input.actor || input.actor.trim().length === 0) {
    return { ok: false, reason: 'A lifecycle transition requires an identified actor.' };
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, reason: 'A lifecycle transition requires a non-blank reason.' };
  }
  if (from === to) {
    return { ok: false, reason: `The case is already in '${from}'.` };
  }
  if (!canTransition(from, to)) {
    return { ok: false, reason: `Transition ${from} → ${to} is not allowed.` };
  }
  return {
    ok: true,
    state: to,
    transition: { from, to, actor: input.actor.trim(), reason: input.reason.trim(), at: opts.now },
  };
}

/** The set of states a case may move to next (for UI affordances). */
export function nextStates(from: LifecycleState): LifecycleState[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/**
 * Build an ordered timeline from a transition history. The first entry is the
 * initial state (derived from the first transition's `from`, or `seed`).
 */
export function buildTimeline(
  transitions: LifecycleTransition[],
  seed?: { state: LifecycleState; at: string; actor?: string },
): TimelineEntry[] {
  if (transitions.length === 0) {
    return seed ? [{ state: seed.state, enteredAt: seed.at, actor: seed.actor ?? 'system', reason: 'Created.' }] : [];
  }
  const sorted = [...transitions].sort((a, b) => a.at.localeCompare(b.at));
  const entries: TimelineEntry[] = [];
  // Initial state.
  entries.push({
    state: seed?.state ?? sorted[0].from,
    enteredAt: seed?.at ?? sorted[0].at,
    actor: seed?.actor ?? 'system',
    reason: 'Created.',
  });
  for (const t of sorted) {
    entries.push({ state: t.to, enteredAt: t.at, actor: t.actor, reason: t.reason });
  }
  // Compute durations between consecutive entries.
  for (let i = 0; i < entries.length - 1; i++) {
    const a = Date.parse(entries[i].enteredAt);
    const b = Date.parse(entries[i + 1].enteredAt);
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) entries[i].durationMs = b - a;
  }
  return entries;
}

/** Progress 0..1 along the canonical order (ARCHIVED counts as complete). */
export function lifecycleProgress(state: LifecycleState): number {
  const idx = LIFECYCLE_ORDER.indexOf(state);
  if (idx < 0) return 0;
  return Math.round((idx / (LIFECYCLE_ORDER.length - 1)) * 100) / 100;
}
