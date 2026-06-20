// =============================================================================
// HSI Phase 70.1 — POST /api/observability/report. Frontend error capture sink.
//
// Rate-limited, anonymous-safe. Forwards a client-side error to the observability
// layer (infra_events audit + Sentry-capturable surface). No sensitive data is
// stored beyond the message + a short context. Never throws.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from '@/lib/rate-limit';
import { reportError } from '@/lib/infra/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  pruneRateLimit();
  const rl = rateLimit(`obs-report:${clientKeyFromHeaders(request.headers)}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429, headers: { 'cache-control': 'no-store' } });
  try {
    const body = (await request.json().catch(() => ({}))) as { message?: unknown; path?: unknown; digest?: unknown };
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : 'Unknown client error';
    const path = typeof body.path === 'string' ? body.path.slice(0, 200) : undefined;
    const digest = typeof body.digest === 'string' ? body.digest.slice(0, 64) : undefined;
    await reportError('frontend', new Error(message), { path, digest });
    return NextResponse.json({ ok: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }
}
