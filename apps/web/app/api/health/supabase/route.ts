// =============================================================================
// GET /api/health/supabase — aggregate Supabase dependency health probe.
//
// Runs the auth+rest aggregate probe and returns the shaped HealthResponse.
// 200 when ok, 503 when down/unconfigured. No secrets in the body (probes shape
// details through redactDetails). Best-effort: logs a security event when down.
// =============================================================================

import { NextResponse } from 'next/server';
import { probeSupabase } from '@/lib/health/probes';
import { logHealthFailure } from '@/lib/security/log';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, 'health', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const result = await probeSupabase();
  if (!result.ok) {
    void logHealthFailure({
      service: 'supabase',
      message: result.message,
      route: '/api/health/supabase',
      cloudflareChallenge: Boolean(result.details?.cloudflareChallenge),
    }).catch(() => undefined);
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
