// =============================================================================
// GET /api/public/trust — Phase 49 public trust & transparency read API.
//
// Read-only, anonymous-safe, rate-limited. Returns the trust overview metrics,
// review pipeline, public correction log, and platform health from the shared
// cached trust layer. Public-safe only (no identities, no internal notes). Never
// throws — degrades to a valid empty body.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getTrustData } from '@/lib/trust-intelligence';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  pruneRateLimit();
  const rl = rateLimit(`pub-trust:${clientKeyFromHeaders(request.headers)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Please try again shortly.' },
      { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } },
    );
  }

  try {
    const trust = await getTrustData();
    return NextResponse.json(
      { ok: true, metrics: trust.overview, pipeline: trust.pipeline, corrections: trust.corrections, health: trust.health },
      {
        status: 200,
        headers: {
          'cache-control': 'public, max-age=120, stale-while-revalidate=300',
          'x-ratelimit-limit': String(rl.limit),
          'x-ratelimit-remaining': String(rl.remaining),
        },
      },
    );
  } catch {
    return NextResponse.json(
      { ok: true, metrics: null, pipeline: [], corrections: [], health: null },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
