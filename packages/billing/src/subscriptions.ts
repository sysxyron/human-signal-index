// =============================================================================
// Subscription state mapping + reconciliation + trials — PURE. Maps Stripe
// subscription status onto the internal org status, decides whether paid
// entitlements apply, and reconciles a snapshot into the DB shape. Trial math is
// here too. No Date.now() — callers pass `nowISO`.
// =============================================================================

import type { PlanSlug } from '@hsi/entitlements';
import type {
  OrgSubscriptionStatus,
  ReconciledSubscription,
  StripeSubscriptionStatus,
  SubscriptionSnapshot,
} from './types';

export const DEFAULT_TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

/** Map a Stripe status onto the internal {trial,active,paused,expired}. PURE. */
export function mapStripeStatus(status: StripeSubscriptionStatus): OrgSubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trial';
    case 'active':
    case 'past_due': // still has access during dunning
      return 'active';
    case 'paused':
    case 'unpaid':
      return 'paused';
    case 'canceled':
    case 'incomplete':
    case 'incomplete_expired':
      return 'expired';
    default:
      return 'expired';
  }
}

/**
 * Whether PAID entitlements should apply for a Stripe status. Trialing, active and
 * past_due (grace) keep access; unpaid/paused/canceled/incomplete lose it. PURE.
 */
export function isAccessActive(status: StripeSubscriptionStatus): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due';
}

/**
 * Reconcile a Stripe snapshot into the organization_subscriptions shape. When
 * access is inactive the entitlement plan falls back to 'community' (so a lapsed
 * org keeps free-tier features, never premium). PURE.
 */
export function reconcileSubscription(snapshot: SubscriptionSnapshot): ReconciledSubscription {
  const accessActive = isAccessActive(snapshot.status);
  return {
    status: mapStripeStatus(snapshot.status),
    planSlug: accessActive ? snapshot.planSlug : 'community',
    billingCycle: snapshot.billingCycle,
    currentPeriodStart: snapshot.currentPeriodStart,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    accessActive,
  };
}

/** The entitlement plan to apply for a snapshot (community when access inactive). PURE. */
export function entitlementPlanSlug(snapshot: SubscriptionSnapshot): PlanSlug {
  return isAccessActive(snapshot.status) ? snapshot.planSlug : 'community';
}

// ---- trials -----------------------------------------------------------------

/** Whole days remaining until trialEnd (0 once elapsed/absent). PURE. */
export function trialDaysRemaining(trialEndISO: string | null, nowISO: string): number {
  if (!trialEndISO) return 0;
  const end = Date.parse(trialEndISO);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/** Is the trial still running at nowISO? PURE. */
export function isTrialActive(trialEndISO: string | null, nowISO: string): boolean {
  return trialDaysRemaining(trialEndISO, nowISO) > 0;
}

/** Has a trial elapsed (had an end in the past)? PURE. */
export function isTrialExpired(trialEndISO: string | null, nowISO: string): boolean {
  if (!trialEndISO) return false;
  const end = Date.parse(trialEndISO);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(end) || !Number.isFinite(now)) return false;
  return end <= now;
}

/** Compute a trial end ISO `days` after `startISO`. PURE. */
export function trialEndFrom(startISO: string, days: number = DEFAULT_TRIAL_DAYS): string {
  const start = Date.parse(startISO);
  if (!Number.isFinite(start)) return startISO;
  return new Date(start + Math.max(0, days) * DAY_MS).toISOString();
}
