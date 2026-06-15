// =============================================================================
// Webhook operations — PURE. Dead-letter eligibility + replay decisions for failed
// Stripe webhook events. Replay-safe + idempotent by design: the route still keys
// on the unique event id; this is the deterministic decision logic. No DB.
// =============================================================================

import { isHandledEvent } from '@hsi/billing';
import type { DeadLetterEvent, ReplayDecision } from './types';

/** Max automatic replay attempts before an event stays in the dead-letter queue. */
export const MAX_REPLAY_ATTEMPTS = 5;

/** Decide whether a failed event may be replayed. PURE. */
export function decideReplay(event: DeadLetterEvent): ReplayDecision {
  if (!isHandledEvent(event.type)) return { replay: false, reason: 'unknown_event' };
  if (event.attempts >= MAX_REPLAY_ATTEMPTS) return { replay: false, reason: 'max_attempts' };
  return { replay: true, reason: 'eligible' };
}

/** Should an event move to the dead-letter queue (handled but out of attempts)? PURE. */
export function isDeadLettered(event: DeadLetterEvent): boolean {
  return isHandledEvent(event.type) && event.attempts >= MAX_REPLAY_ATTEMPTS;
}

export interface WebhookOpsSummary {
  processed: number;
  failed: number;
  deadLettered: number;
  replayable: number;
}

/** Summarize webhook health from event rows. PURE. */
export function summarizeWebhookOps(
  events: Array<{ processed: boolean; error: string | null; type: string; attempts: number }>,
): WebhookOpsSummary {
  let processed = 0, failed = 0, deadLettered = 0, replayable = 0;
  for (const e of events) {
    if (e.processed && !e.error) { processed++; continue; }
    failed++;
    const dl: DeadLetterEvent = { stripeEventId: '', type: e.type, attempts: e.attempts, lastError: e.error };
    if (isDeadLettered(dl)) deadLettered++;
    if (decideReplay(dl).replay) replayable++;
  }
  return { processed, failed, deadLettered, replayable };
}

/** Next attempt count after a replay. PURE. */
export function nextAttempt(attempts: number): number {
  return Math.max(0, Math.floor(attempts)) + 1;
}
