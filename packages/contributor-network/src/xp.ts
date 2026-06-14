// =============================================================================
// XP ledger — APPEND-ONLY. XP represents ACTIVITY (not quality; see reputation).
// Corrections never edit history: they append an 'adjustment' entry (may be
// negative). totalXp() simply sums the ledger.
// =============================================================================

import type { XpEntry, XpEvent } from './types';

/** Canonical XP value per event (Phase 25 spec). */
export const XP_VALUES: Record<Exclude<XpEvent, 'adjustment'>, number> = {
  signal_submitted: 10,
  signal_accepted: 25,
  source_submitted: 10,
  source_verified: 25,
  evidence_package_created: 50,
  investigation_created: 75,
  investigation_completed: 100,
  review_completed: 40,
  publication_prepared: 100,
  governance_action_completed: 75,
};

/** Build an XP entry for an activity event at `at`. */
export function xpFor(event: Exclude<XpEvent, 'adjustment'>, at: string, note?: string): XpEntry {
  return { event, amount: XP_VALUES[event], at, note };
}

/** Build an append-only correction entry (never edit prior rows). */
export function xpAdjustment(amount: number, at: string, note: string): XpEntry {
  return { event: 'adjustment', amount, at, note };
}

/** Sum the ledger (activity XP, never negative overall is NOT enforced here). */
export function totalXp(ledger: XpEntry[]): number {
  return ledger.reduce((sum, e) => sum + (Number.isFinite(e.amount) ? e.amount : 0), 0);
}

/** XP grouped by event, for breakdowns. */
export function xpByEvent(ledger: XpEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of ledger) out[e.event] = (out[e.event] ?? 0) + e.amount;
  return out;
}
