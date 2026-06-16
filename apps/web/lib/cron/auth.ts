// =============================================================================
// HSI — cron authorization (SERVER-ONLY, PURE).
//
// Guards protected cron endpoints. Accepts the secret three ways so the same
// route works for Vercel Cron, an external scheduler, and a manual curl:
//   1. `Authorization: Bearer <CRON_SECRET>`  (Vercel Cron sends this)
//   2. `x-cron-secret: <CRON_SECRET>`         (external schedulers)
//   3. `?secret=<CRON_SECRET>`                (manual curl trigger)
//
// Comparison is constant-time. With no configured secret the request is DENIED
// (fail closed) — a cron route must never run unauthenticated.
// =============================================================================

import { timingSafeEqual } from 'node:crypto';

export interface CronAuthInput {
  authorization?: string | null;
  cronSecretHeader?: string | null;
  querySecret?: string | null;
}

/** Constant-time string compare (length-safe; mismatched lengths → false). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** True iff the request presents the correct CRON_SECRET. Fail-closed. PURE. */
export function isCronAuthorized(input: CronAuthInput, secret: string | undefined): boolean {
  if (!secret) return false;
  const bearer = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (bearer && safeEqual(bearer, secret)) return true;
  const header = (input.cronSecretHeader ?? '').trim();
  if (header && safeEqual(header, secret)) return true;
  const query = (input.querySecret ?? '').trim();
  if (query && safeEqual(query, secret)) return true;
  return false;
}
