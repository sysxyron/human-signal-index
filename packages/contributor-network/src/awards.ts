// =============================================================================
// Award RULES (Phase 26) — the deterministic mapping from a PLATFORM action to
// contributor ledger entries. PURE: no DB, no Date.now(). The recorder applies
// these idempotently; the worker derives reputation/ranks/badges from the events.
//
// GOVERNANCE / ANTI-GAMING: rules that reward review quality require a DISTINCT
// actor and subject (you cannot accept/reject your own work for credit). Awards
// never touch RBAC — the XP RANK ladder here is recognition only.
// =============================================================================

import type { CreditEvent, XpEvent } from './types';

/** Platform-level contribution events (distinct from the XP ledger event names). */
export type ContributionEventType =
  | 'SIGNAL_SUBMITTED'
  | 'EVIDENCE_SUBMITTED'
  | 'SIGNAL_ACCEPTED'
  | 'SIGNAL_REJECTED'
  | 'INVESTIGATION_SUBMITTED'
  | 'INVESTIGATION_ACTIVE'
  | 'INVESTIGATION_UNDER_REVIEW'
  | 'INVESTIGATION_APPROVED'
  | 'INVESTIGATION_PUBLISHED'
  | 'INVESTIGATION_ARCHIVED'
  | 'REVIEW_COMPLETED'
  | 'GOVERNANCE_ACTION'
  | 'REPORT_PUBLISHED';

/** Who receives an award: the ACTOR (who did the action) or the SUBJECT (whose work it concerns). */
export type Recipient = 'actor' | 'subject';

export interface AwardLine {
  to: Recipient;
  xp?: Exclude<XpEvent, 'adjustment'>;
  credit?: Exclude<CreditEvent, 'adjustment'>;
}

export interface AwardRule {
  event: ContributionEventType;
  lines: AwardLine[];
  /** Quality counter this event feeds (drives derived reputation). */
  affects?: 'accepted' | 'rejected';
  /** When true, actor and subject MUST differ or the award is rejected (anti-gaming). */
  distinctRequired?: boolean;
}

/** Canonical award rules. Absent events emit an audit row with no ledger lines. */
export const AWARD_RULES: Record<ContributionEventType, AwardRule> = {
  SIGNAL_SUBMITTED: { event: 'SIGNAL_SUBMITTED', lines: [{ to: 'actor', xp: 'signal_submitted' }] },
  EVIDENCE_SUBMITTED: { event: 'EVIDENCE_SUBMITTED', lines: [{ to: 'actor', xp: 'evidence_package_created' }] },
  SIGNAL_ACCEPTED: {
    event: 'SIGNAL_ACCEPTED',
    lines: [{ to: 'subject', xp: 'signal_accepted' }, { to: 'actor', xp: 'review_completed' }],
    affects: 'accepted', distinctRequired: true,
  },
  SIGNAL_REJECTED: {
    event: 'SIGNAL_REJECTED',
    lines: [{ to: 'actor', xp: 'review_completed' }],
    affects: 'rejected', distinctRequired: true,
  },
  INVESTIGATION_SUBMITTED: { event: 'INVESTIGATION_SUBMITTED', lines: [{ to: 'actor', xp: 'investigation_created' }] },
  INVESTIGATION_ACTIVE: { event: 'INVESTIGATION_ACTIVE', lines: [] },
  INVESTIGATION_UNDER_REVIEW: { event: 'INVESTIGATION_UNDER_REVIEW', lines: [] },
  INVESTIGATION_APPROVED: { event: 'INVESTIGATION_APPROVED', lines: [{ to: 'subject', xp: 'investigation_completed' }, { to: 'actor', xp: 'review_completed' }], distinctRequired: true },
  INVESTIGATION_PUBLISHED: { event: 'INVESTIGATION_PUBLISHED', lines: [{ to: 'actor', xp: 'publication_prepared' }] },
  INVESTIGATION_ARCHIVED: { event: 'INVESTIGATION_ARCHIVED', lines: [] },
  REVIEW_COMPLETED: { event: 'REVIEW_COMPLETED', lines: [{ to: 'actor', xp: 'review_completed' }] },
  GOVERNANCE_ACTION: { event: 'GOVERNANCE_ACTION', lines: [{ to: 'actor', xp: 'governance_action_completed' }] },
  REPORT_PUBLISHED: {
    event: 'REPORT_PUBLISHED',
    lines: [
      { to: 'actor', xp: 'publication_prepared', credit: 'investigation_approved' },
      { to: 'subject', credit: 'quality_submission' },
    ],
  },
};

export function ruleFor(event: ContributionEventType): AwardRule | undefined {
  return AWARD_RULES[event];
}

export interface AwardContext { actorId: string; subjectId?: string | null }
export interface ResolvedLine {
  recipientId: string;
  xp?: Exclude<XpEvent, 'adjustment'>;
  credit?: Exclude<CreditEvent, 'adjustment'>;
}
export type AwardDecision =
  | { ok: true; lines: ResolvedLine[]; affects?: 'accepted' | 'rejected'; affectsSubjectId?: string }
  | { ok: false; reason: string };

/**
 * Resolve a rule against a context: validate anti-gaming, resolve actor/subject
 * to recipient ids, and drop lines whose recipient is unknown. PURE.
 */
export function resolveAwards(event: ContributionEventType, ctx: AwardContext): AwardDecision {
  const rule = AWARD_RULES[event];
  if (!rule) return { ok: false, reason: `Unknown contribution event '${event}'.` };
  if (!ctx.actorId) return { ok: false, reason: 'An award requires an actor.' };
  if (rule.distinctRequired) {
    if (!ctx.subjectId) return { ok: false, reason: `${event} requires a distinct subject.` };
    if (ctx.subjectId === ctx.actorId) return { ok: false, reason: 'Self-award rejected: actor and subject are the same user.' };
  }
  const lines: ResolvedLine[] = [];
  for (const l of rule.lines) {
    const recipientId = l.to === 'actor' ? ctx.actorId : ctx.subjectId ?? null;
    if (recipientId) lines.push({ recipientId, xp: l.xp, credit: l.credit });
  }
  return { ok: true, lines, affects: rule.affects, affectsSubjectId: rule.affects ? (ctx.subjectId ?? ctx.actorId) : undefined };
}

/**
 * Deterministic idempotency key for one (event, ref, recipient, line) award.
 * Re-processing the same platform action yields the same key, so a UNIQUE
 * constraint on the audit table makes award processing idempotent.
 */
export function idempotencyKey(parts: { event: string; refKind: string; refId: string; recipientId: string; slot: string }): string {
  return [parts.event, parts.refKind, parts.refId, parts.recipientId, parts.slot].join('|');
}

// ---- XP RANK ladder (Deliverable 8) — recognition only, never an RBAC role ----
export interface XpRank { name: string; minXp: number }
export const XP_RANKS: XpRank[] = [
  { name: 'Observer', minXp: 0 },
  { name: 'Analyst', minXp: 250 },
  { name: 'Investigator', minXp: 1000 },
  { name: 'Specialist', minXp: 2500 },
  { name: 'Expert', minXp: 5000 },
  { name: 'Master', minXp: 10000 },
  { name: 'Legend', minXp: 20000 },
];

/** The contribution rank for a given XP total. */
export function xpRankFor(xp: number): XpRank {
  let current = XP_RANKS[0];
  for (const r of XP_RANKS) if (xp >= r.minXp) current = r; else break;
  return current;
}

/** The next rank + XP needed, or null at the top. */
export function nextXpRank(xp: number): { rank: XpRank; xpToNext: number } | null {
  const idx = XP_RANKS.findIndex((r) => r.name === xpRankFor(xp).name);
  const next = XP_RANKS[idx + 1];
  return next ? { rank: next, xpToNext: Math.max(0, next.minXp - xp) } : null;
}

/** Default reputation penalty applied per rejected signal (configurable by the worker). */
export const DEFAULT_REJECTION_PENALTY = 5;
