// =============================================================================
// @hsi/publishing-engine — the publication LIFECYCLE state machine.
//
// createPublication() starts a DRAFT; transitionPublication() applies an explicit
// transition (validated, audited); the convenience helpers (publish / unpublish /
// archive / update) wrap it. Every transition appends a PublicationEvent and there
// are NO silent failures — an invalid transition returns ok:false with a reason.
//
// LIFECYCLE:
//   DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
//   APPROVED/PUBLISHED → RETRACTED (terminal-ish; stays visible)
//   PUBLISHED → ARCHIVED (sunset) or UNDER_REVIEW (unpublish → re-review)
//   UNDER_REVIEW → DRAFT (sent back); APPROVED → DRAFT (revisions)
//
// NOTHING is publishable here without first being APPROVED (which itself requires
// the governance gate — see governance.ts).
// =============================================================================

import type {
  Publication,
  PublicationEvent,
  PublicationInput,
  PublicationPatch,
  PublicationState,
  PublicationTransitionResult,
  PublicationTransitionValidity,
} from './types';

/** The explicit allowed-transition map. */
export const PUBLICATION_TRANSITIONS: Record<PublicationState, PublicationState[]> = {
  DRAFT: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['APPROVED', 'DRAFT', 'ARCHIVED'],
  APPROVED: ['PUBLISHED', 'DRAFT', 'RETRACTED', 'ARCHIVED'],
  PUBLISHED: ['UNDER_REVIEW', 'ARCHIVED', 'RETRACTED'],
  ARCHIVED: ['DRAFT'],
  RETRACTED: [], // retractions remain visible; no further automatic transitions.
};

/** Mutable states (content may be edited). */
export const EDITABLE_STATES: PublicationState[] = ['DRAFT', 'UNDER_REVIEW'];

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Is `to` a legal transition from `from`? Explainable verdict. */
export function validatePublicationTransition(
  from: PublicationState,
  to: PublicationState,
): PublicationTransitionValidity {
  if (from === to) {
    return { valid: false, reason: `Already in state '${from}'; no self-transition.` };
  }
  const allowed = PUBLICATION_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) {
    return { valid: true, reason: `'${from}' → '${to}' is permitted.` };
  }
  return {
    valid: false,
    reason: `'${from}' → '${to}' is not permitted (allowed: ${allowed.join(', ') || 'none'}).`,
  };
}

/** Create a publication in DRAFT with a genesis event. */
export function createPublication(
  input: PublicationInput,
  opts: { now: string; actor?: string },
): Publication {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    summary: input.summary,
    state: 'DRAFT',
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.trustScore !== undefined ? { trustScore: clamp(input.trustScore, 0, 100) } : {}),
    ...(input.confidence !== undefined ? { confidence: clamp(input.confidence, 0, 1) } : {}),
    evidenceCount: Math.max(0, Math.floor(input.evidenceCount ?? 0)),
    sourceCount: Math.max(0, Math.floor(input.sourceCount ?? 0)),
    categories: input.categories ? [...input.categories] : [],
    topics: input.topics ? [...input.topics] : [],
    reviewStatus: 'pending',
    governanceStatus: 'pending',
    createdAt: opts.now,
    updatedAt: opts.now,
    events: [
      {
        publicationId: input.id,
        from: 'DRAFT',
        to: 'DRAFT',
        actor: opts.actor ?? 'author',
        reason: 'Publication drafted.',
        at: opts.now,
      },
    ],
  };
}

/**
 * Apply an explicit transition. Validates first; on success returns a NEW
 * publication (inputs not mutated) with the event appended + publishedAt stamped
 * when entering PUBLISHED. NEVER throws / silently no-ops.
 */
export function transitionPublication(
  publication: Publication,
  to: PublicationState,
  opts: { now: string; actor?: string; reason?: string },
): PublicationTransitionResult {
  const verdict = validatePublicationTransition(publication.state, to);
  if (!verdict.valid) {
    return { ok: false, error: 'INVALID_TRANSITION', reason: verdict.reason };
  }
  const event: PublicationEvent = {
    publicationId: publication.id,
    from: publication.state,
    to,
    actor: opts.actor ?? 'curator',
    reason: opts.reason ?? verdict.reason,
    at: opts.now,
  };
  const next: Publication = {
    ...publication,
    state: to,
    updatedAt: opts.now,
    ...(to === 'PUBLISHED' ? { publishedAt: opts.now } : {}),
    reviewStatus: reviewStatusFor(to, publication.reviewStatus),
    governanceStatus: governanceStatusFor(to, publication.governanceStatus),
    events: [...publication.events, event],
  };
  return { ok: true, publication: next, event };
}

function reviewStatusFor(to: PublicationState, prev?: string): string {
  if (to === 'UNDER_REVIEW') return 'in_review';
  if (to === 'APPROVED' || to === 'PUBLISHED') return 'approved';
  if (to === 'RETRACTED') return 'retracted';
  if (to === 'DRAFT') return 'pending';
  return prev ?? 'pending';
}
function governanceStatusFor(to: PublicationState, prev?: string): string {
  if (to === 'APPROVED' || to === 'PUBLISHED') return 'cleared';
  if (to === 'RETRACTED') return 'retracted';
  if (to === 'UNDER_REVIEW') return 'reviewing';
  return prev ?? 'pending';
}

/**
 * Update editable content (DRAFT / UNDER_REVIEW only). Returns ok:false for a
 * non-editable state (PUBLISHED content is immutable — unpublish first). Inputs
 * not mutated.
 */
export function updatePublication(
  publication: Publication,
  patch: PublicationPatch,
  opts: { now: string },
): { ok: true; publication: Publication } | { ok: false; error: string; reason: string } {
  if (!EDITABLE_STATES.includes(publication.state)) {
    return {
      ok: false,
      error: 'NOT_EDITABLE',
      reason: `Cannot edit a '${publication.state}' publication; only DRAFT / UNDER_REVIEW are editable.`,
    };
  }
  const next: Publication = {
    ...publication,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.trustScore !== undefined ? { trustScore: clamp(patch.trustScore, 0, 100) } : {}),
    ...(patch.confidence !== undefined ? { confidence: clamp(patch.confidence, 0, 1) } : {}),
    ...(patch.evidenceCount !== undefined ? { evidenceCount: Math.max(0, Math.floor(patch.evidenceCount)) } : {}),
    ...(patch.sourceCount !== undefined ? { sourceCount: Math.max(0, Math.floor(patch.sourceCount)) } : {}),
    ...(patch.categories ? { categories: [...patch.categories] } : {}),
    ...(patch.topics ? { topics: [...patch.topics] } : {}),
    updatedAt: opts.now,
  };
  return { ok: true, publication: next };
}

/** Convenience: send a publication to PUBLISHED (must currently be APPROVED). */
export function publishPublication(
  publication: Publication,
  opts: { now: string; actor?: string; reason?: string },
): PublicationTransitionResult {
  return transitionPublication(publication, 'PUBLISHED', {
    ...opts,
    reason: opts.reason ?? 'Published after governance approval.',
  });
}

/** Convenience: unpublish (PUBLISHED → UNDER_REVIEW) for re-review. */
export function unpublishPublication(
  publication: Publication,
  opts: { now: string; actor?: string; reason?: string },
): PublicationTransitionResult {
  return transitionPublication(publication, 'UNDER_REVIEW', {
    ...opts,
    reason: opts.reason ?? 'Unpublished pending re-review.',
  });
}

/** Convenience: archive (sunset) a publication. */
export function archivePublication(
  publication: Publication,
  opts: { now: string; actor?: string; reason?: string },
): PublicationTransitionResult {
  return transitionPublication(publication, 'ARCHIVED', {
    ...opts,
    reason: opts.reason ?? 'Archived.',
  });
}

/** Is this publication publicly visible (PUBLISHED or RETRACTED — retractions stay visible)? */
export function isPubliclyVisible(state: PublicationState): boolean {
  return state === 'PUBLISHED' || state === 'RETRACTED';
}
