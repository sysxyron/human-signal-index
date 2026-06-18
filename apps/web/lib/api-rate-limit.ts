// =============================================================================
// HSI Phase 56.1 — thin NextResponse adapter over the pure in-memory limiter
// (lib/rate-limit.ts stays Next-free). Returns a 429 response when the caller
// exceeds the window, else null (allow). No external infrastructure.
// =============================================================================

import { NextResponse } from 'next/server';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from './rate-limit';

/** Returns a 429 NextResponse when over the limit, or null to proceed. */
export function enforceRateLimit(
  request: Request,
  keyPrefix: string,
  opts: { limit?: number; windowMs?: number } = {},
): NextResponse | null {
  pruneRateLimit();
  const rl = rateLimit(`${keyPrefix}:${clientKeyFromHeaders(request.headers)}`, opts);
  if (rl.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { ok: false, error: 'Rate limit exceeded. Please try again shortly.' },
    { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } },
  );
}
