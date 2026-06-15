// =============================================================================
// HSI Phase 36 — invitation validity rules. PURE (no DB, no Date.now()).
// Token generation + persistence live in the DAL; these rules are testable.
// =============================================================================

export type InviteState = 'valid' | 'expired' | 'accepted' | 'not_found';

export interface InviteLike {
  email: string;
  expiresAt: string;
  acceptedAt?: string | null;
}

/** Classify an invite for a given viewer email + now. PURE. */
export function inviteState(invite: InviteLike | null, nowMs: number): InviteState {
  if (!invite) return 'not_found';
  if (invite.acceptedAt) return 'accepted';
  const exp = Date.parse(invite.expiresAt);
  if (Number.isNaN(exp) || exp <= nowMs) return 'expired';
  return 'valid';
}

/** Does the signed-in email match the invite (case-insensitive)? PURE. */
export function inviteEmailMatches(inviteEmail: string, userEmail: string | null | undefined): boolean {
  return Boolean(userEmail) && inviteEmail.trim().toLowerCase() === String(userEmail).trim().toLowerCase();
}

/** Can this invite be accepted by this user right now? PURE. */
export function canAcceptInvite(invite: InviteLike | null, userEmail: string | null, nowMs: number): boolean {
  return inviteState(invite, nowMs) === 'valid' && !!invite && inviteEmailMatches(invite.email, userEmail);
}

/** Default invite lifetime (ms) — 7 days. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
