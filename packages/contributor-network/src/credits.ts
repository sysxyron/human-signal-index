// =============================================================================
// Intel Credits — internal RECOGNITION credits (NOT money in this phase). Earned
// from quality work, missions, badges, approved investigations, special ops.
// Append-only ledger, like XP. May LATER back bounties/grants — not now.
// =============================================================================

import type { CreditEntry, CreditEvent } from './types';

/** Default credit award per event (recognition only). */
export const CREDIT_VALUES: Record<Exclude<CreditEvent, 'adjustment'>, number> = {
  quality_submission: 5,
  mission_completed: 15,
  badge_earned: 25,
  investigation_approved: 40,
  special_operation: 50,
};

export function creditFor(event: Exclude<CreditEvent, 'adjustment'>, at: string, note?: string): CreditEntry {
  return { event, amount: CREDIT_VALUES[event], at, note };
}

export function creditAdjustment(amount: number, at: string, note: string): CreditEntry {
  return { event: 'adjustment', amount, at, note };
}

export function totalCredits(ledger: CreditEntry[]): number {
  return ledger.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
}
