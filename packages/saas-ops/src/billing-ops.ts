// =============================================================================
// Billing operations + proration — PURE. Plan-change classification, proration
// math (preview; Stripe is the source of truth), and billing-ops summarization.
// No SDK, no DB, no clocks.
// =============================================================================

import { PLAN_DEFS, planDef, type PlanSlug } from '@hsi/entitlements';
import type { ChangeTiming, OpsSubscription, PlanChangeKind, ProrationResult } from './types';

/** Compare two plans by tier → upgrade / downgrade / none. PURE. */
export function planChangeKind(currentSlug: PlanSlug, newSlug: PlanSlug): PlanChangeKind {
  const a = planDef(currentSlug)?.tier ?? 0;
  const b = planDef(newSlug)?.tier ?? 0;
  if (b > a) return 'upgrade';
  if (b < a) return 'downgrade';
  return 'none';
}

/** Upgrades apply immediately; downgrades at next cycle (no mid-cycle refund). PURE. */
export function resolveChangeTiming(kind: PlanChangeKind): ChangeTiming {
  return kind === 'upgrade' ? 'immediate' : 'next_cycle';
}

/**
 * Proration preview for a plan change. Credit = unused portion of the current
 * plan; charge = remaining portion of the new plan. Upgrades net immediately;
 * downgrades take effect next cycle (charge/credit 0 now). PURE — Stripe computes
 * the authoritative proration on apply.
 */
export function calculateProration(input: {
  currentAmount: number; // minor units / period
  newAmount: number; // minor units / period
  daysRemaining: number;
  periodDays: number;
  currentSlug: PlanSlug;
  newSlug: PlanSlug;
}): ProrationResult {
  const kind = planChangeKind(input.currentSlug, input.newSlug);
  const timing = resolveChangeTiming(kind);
  const periodDays = Math.max(1, Math.floor(input.periodDays));
  const remaining = Math.max(0, Math.min(periodDays, Math.floor(input.daysRemaining)));
  const frac = remaining / periodDays;

  if (kind !== 'upgrade') {
    // Downgrade / no-op: no immediate money movement.
    return { kind, timing, credit: 0, charge: 0, netAmount: 0, immediate: false };
  }
  const credit = Math.round(Math.max(0, input.currentAmount) * frac);
  const charge = Math.round(Math.max(0, input.newAmount) * frac);
  return { kind, timing, credit, charge, netAmount: charge - credit, immediate: true };
}

export interface BillingOpsSummary {
  active: number;
  trialing: number;
  canceled: number;
  pastDue: number;
  paused: number;
  paymentFailures: number;
}

/** Summarize the subscription base for the billing-ops dashboard. PURE. */
export function summarizeBillingOps(subs: OpsSubscription[], paymentFailures = 0): BillingOpsSummary {
  const s: BillingOpsSummary = { active: 0, trialing: 0, canceled: 0, pastDue: 0, paused: 0, paymentFailures };
  for (const sub of subs) {
    switch (sub.status) {
      case 'active': s.active++; break;
      case 'trial': case 'trialing': s.trialing++; break;
      case 'past_due': s.pastDue++; break;
      case 'paused': s.paused++; break;
      case 'expired': case 'canceled': s.canceled++; break;
    }
  }
  return s;
}

/** Stripe proration_behavior hint for a change kind. PURE. */
export function prorationBehavior(kind: PlanChangeKind): 'create_prorations' | 'none' {
  return kind === 'upgrade' ? 'create_prorations' : 'none';
}

export const PURCHASABLE_TIERS = PLAN_DEFS.filter((p) => p.tier > 0).map((p) => p.slug);
