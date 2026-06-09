// =============================================================================
// GET /api/health/auth — Supabase Auth (GoTrue) settings endpoint probe.
//
// 200 when ok, 503 when down/unconfigured. No secrets in the body. Best-effort:
// logs a security event when down (cloudflare_challenge vs health_check_failure).
// =============================================================================

import { NextResponse } from 'next/server';
import { probeAuth } from '@/lib/health/probes';
import { logHealthFailure } from '@/lib/security/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const result = await probeAuth();
  if (!result.ok) {
    void logHealthFailure({
      service: 'auth',
      message: result.message,
      route: '/api/health/auth',
      cloudflareChallenge: Boolean(result.details?.cloudflareChallenge),
    }).catch(() => undefined);
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
