// =============================================================================
// Billing Portal session input builder — PURE. Produces the parameter object for
// a Stripe Billing Portal session. The portal handles payment method, billing
// address, invoices, cancellation and reactivation (Stripe-hosted). No SDK.
// =============================================================================

import type { PortalSessionInput } from './types';
import type { BuildResult } from './checkout';

/** Build a validated Billing Portal session input. PURE. */
export function buildPortalInput(customerId: string, returnUrl: string): BuildResult<PortalSessionInput> {
  if (!customerId) return { ok: false, error: 'Missing Stripe customer.' };
  if (!returnUrl) return { ok: false, error: 'Missing return URL.' };
  return { ok: true, value: { customer: customerId, return_url: returnUrl } };
}
