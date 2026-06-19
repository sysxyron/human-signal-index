// =============================================================================
// GET /api/public/transparency — Phase 68 public transparency read API.
//
// Read-only, anonymous-safe, rate-limited. Returns aggregate trust / forecast /
// narrative / source metrics from the cached transparency services. PUBLIC-SAFE:
// only aggregate/published/resolved data — no PII, internal notes, unpublished
// content, private evidence, or alerts. Never throws (degrades gracefully).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from '@/lib/rate-limit';
import { getTransparencyOverview, getForecastTransparency, getNarrativeTransparency, getSourceTransparency } from '@/lib/transparency/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  pruneRateLimit();
  const rl = rateLimit(`pub-transparency:${clientKeyFromHeaders(request.headers)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json({ ok: false, error: 'Rate limit exceeded. Please try again shortly.' }, { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } });
  }

  try {
    const [overview, forecasts, narratives, sources] = await Promise.all([
      getTransparencyOverview(), getForecastTransparency(), getNarrativeTransparency(), getSourceTransparency(),
    ]);
    return NextResponse.json(
      {
        ok: true,
        trust: overview,
        forecasts: { active: forecasts.active, resolved: forecasts.resolved, correct: forecasts.correct, incorrect: forecasts.incorrect, accuracy: forecasts.accuracy, calibrationScore: forecasts.calibrationScore, resolutionRate: forecasts.resolutionRate },
        narratives: narratives.byStatus,
        sources: { total: sources.total, active: sources.active, healthy: sources.healthy, failed: sources.failed, blocked: sources.blocked, collectionSuccessPct: sources.collectionSuccessPct },
      },
      { status: 200, headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=600', 'x-ratelimit-limit': String(rl.limit), 'x-ratelimit-remaining': String(rl.remaining) } },
    );
  } catch {
    return NextResponse.json({ ok: true, trust: null, forecasts: null, narratives: {}, sources: null }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }
}
