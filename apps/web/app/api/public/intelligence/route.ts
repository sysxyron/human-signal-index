// =============================================================================
// GET /api/public/intelligence — Phase 43 public intelligence read API.
//
// Read-only, anonymous-safe, rate-limited. Returns the same cached bundle that
// backs the homepage (metrics + latest published signals + public activity).
// No sensitive fields: only published/aggregate data flows through here (see
// lib/public-intelligence.ts for the public-safety contract). Never throws.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getPublicIntelligenceBundle } from '@/lib/public-intelligence';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  pruneRateLimit();
  const rl = rateLimit(`pub-intel:${clientKeyFromHeaders(request.headers)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded. Please try again shortly.' },
      { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } },
    );
  }

  try {
    const bundle = await getPublicIntelligenceBundle();
    return NextResponse.json(
      {
        ok: true,
        metrics: bundle.metrics,
        latestSignals: bundle.latestSignals,
        activityFeed: bundle.activityFeed,
      },
      {
        status: 200,
        headers: {
          'cache-control': 'public, max-age=60, stale-while-revalidate=120',
          'x-ratelimit-limit': String(rl.limit),
          'x-ratelimit-remaining': String(rl.remaining),
        },
      },
    );
  } catch {
    // Degrade gracefully — public surface should never 500.
    return NextResponse.json(
      { ok: true, metrics: { totalSources: 0, totalSignals: 0, publishedReports: 0, openReviews: 0, traceabilityScore: 0 }, latestSignals: [], activityFeed: [] },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
