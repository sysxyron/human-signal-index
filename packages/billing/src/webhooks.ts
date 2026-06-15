// =============================================================================
// Webhook event classification + idempotency (replay protection) — PURE. Decides
// which downstream action an event triggers and whether an event has already been
// processed. Signature verification + persistence live in the web route; this is
// the deterministic decision logic, fully unit-testable.
// =============================================================================

import type { BillingWebhookEventType, WebhookAction } from './types';

/** Events we act on. Anything else is acknowledged (200) and ignored. */
export const HANDLED_EVENTS: ReadonlySet<string> = new Set<BillingWebhookEventType>([
  'checkout.session.completed',
  'customer.created',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

/** Is this an event type we handle? PURE. */
export function isHandledEvent(type: string): boolean {
  return HANDLED_EVENTS.has(type);
}

/** Map an event type to the downstream action. PURE. */
export function classifyEvent(type: string): WebhookAction {
  switch (type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return 'sync_subscription';
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return 'record_invoice';
    case 'customer.created':
      return 'record_customer';
    default:
      return 'ignore';
  }
}

export interface ProcessDecision {
  process: boolean;
  reason: 'new' | 'duplicate' | 'unhandled';
}

/**
 * Replay protection: given the event id, its type, and the set of already-seen
 * event ids, decide whether to process. Duplicate id → skip; unhandled type →
 * skip; otherwise process. PURE — the route supplies `seenEventIds` from the
 * stripe_events table (unique on event id enforces it at the DB layer too).
 */
export function decideProcessing(
  eventId: string,
  eventType: string,
  seenEventIds: ReadonlySet<string>,
): ProcessDecision {
  if (!eventId) return { process: false, reason: 'duplicate' };
  if (seenEventIds.has(eventId)) return { process: false, reason: 'duplicate' };
  if (!isHandledEvent(eventType)) return { process: false, reason: 'unhandled' };
  return { process: true, reason: 'new' };
}
