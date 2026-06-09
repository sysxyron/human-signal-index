// =============================================================================
// GET /api/health/rest — Supabase REST (PostgREST) root endpoint probe.
//
// 200 when ok, 503 when down/unconfigured. No secrets in the body. Best-effort:
// logs a security event when down.
// =============================================================================

import { NextResponse } from 'next/server';
import { probeRest } from '@/lib/health/probes';
import { logHealthFailure } from '@/lib/security/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const result = await probeRest();
  if (!result.ok) {
    void logHealthFailure({
      service: 'rest',
      message: result.message,
      route: '/api/health/rest',
      cloudflareChallenge: Boolean(result.details?.cloudflareChallenge),
    }).catch(() => undefined);
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
