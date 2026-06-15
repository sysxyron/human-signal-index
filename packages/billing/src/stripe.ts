// =============================================================================
// Stripe configuration + pricing helpers — PURE. No SDK, no network, no secrets.
// Resolves the plan↔price wiring from an env map (price IDs only, never the
// secret key) and formats amounts. The web wrapper performs the actual API calls.
// =============================================================================

import type { PlanSlug } from '@hsi/entitlements';
import { isPlanSlug } from '@hsi/entitlements';
import type { BillingCycle, PlanPricing } from './types';

/** Pin the Stripe API version the integration is written against. */
export const STRIPE_API_VERSION = '2024-06-20';
export const DEFAULT_CURRENCY = 'usd';

/** Plans that are purchasable via Stripe checkout (community is free). */
export const PAID_PLAN_SLUGS: PlanSlug[] = ['professional', 'enterprise', 'government'];

/**
 * Build the plan→price wiring from an env map. Price IDs come from env so the
 * pure layer carries no Stripe identifiers. Amounts (for display + MRR) are
 * optional env hints; missing amounts default to 0 (display falls back to Stripe).
 * Env keys: STRIPE_PRICE_<PLAN>_<MONTHLY|ANNUAL>, STRIPE_AMOUNT_<PLAN>_<...>.
 */
export function resolvePlanPricing(env: Record<string, string | undefined>): PlanPricing[] {
  const currency = (env.STRIPE_CURRENCY || DEFAULT_CURRENCY).toLowerCase();
  const num = (v: string | undefined): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  };
  return PAID_PLAN_SLUGS.map((slug) => {
    const u = slug.toUpperCase();
    return {
      slug,
      monthlyPriceId: env[`STRIPE_PRICE_${u}_MONTHLY`]?.trim() || null,
      annualPriceId: env[`STRIPE_PRICE_${u}_ANNUAL`]?.trim() || null,
      monthlyAmount: num(env[`STRIPE_AMOUNT_${u}_MONTHLY`]),
      annualAmount: num(env[`STRIPE_AMOUNT_${u}_ANNUAL`]),
      currency,
    };
  });
}

/** The Stripe price ID for a plan + cycle, or null when unconfigured. PURE. */
export function priceIdForPlan(pricing: PlanPricing[], slug: PlanSlug, cycle: BillingCycle): string | null {
  const p = pricing.find((x) => x.slug === slug);
  if (!p) return null;
  return cycle === 'annual' ? p.annualPriceId : p.monthlyPriceId;
}

/** Resolve a Stripe price ID back to plan + cycle, or null. PURE. */
export function planForPriceId(pricing: PlanPricing[], priceId: string): { slug: PlanSlug; cycle: BillingCycle } | null {
  for (const p of pricing) {
    if (p.monthlyPriceId === priceId) return { slug: p.slug, cycle: 'monthly' };
    if (p.annualPriceId === priceId) return { slug: p.slug, cycle: 'annual' };
  }
  return null;
}

/** The monthly-equivalent amount (minor units) for a plan+cycle. Annual ÷ 12. PURE. */
export function monthlyEquivalentAmount(pricing: PlanPricing[], slug: PlanSlug, cycle: BillingCycle): number {
  const p = pricing.find((x) => x.slug === slug);
  if (!p) return 0;
  return cycle === 'annual' ? Math.round(p.annualAmount / 12) : p.monthlyAmount;
}

/** Format a minor-unit amount as a currency string. PURE (no Intl locale drift). */
export function formatAmount(minorUnits: number, currency: string = DEFAULT_CURRENCY): string {
  const symbol = currency.toLowerCase() === 'usd' ? '$' : `${currency.toUpperCase()} `;
  const major = (minorUnits / 100).toFixed(2);
  // thousands separators, deterministic
  const [whole, frac] = major.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${grouped}.${frac}`;
}

/** Validate a plan slug came from a trusted source; community is not purchasable. */
export function isPurchasablePlan(slug: string): slug is PlanSlug {
  return isPlanSlug(slug) && PAID_PLAN_SLUGS.includes(slug);
}
