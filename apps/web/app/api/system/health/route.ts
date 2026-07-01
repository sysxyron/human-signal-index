// =============================================================================
// HSI Phase 74.4 — GET /api/system/health. Public, READ-ONLY database +
// availability snapshot. Performs a single read-only DB probe (no writes). No
// secrets, tokens, cookies, user data, connection strings, or credentials.
// =============================================================================

import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/hsi/health';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Unauthenticated + triggers a DB probe → rate-limit to prevent probe amplification.
  const limited = enforceRateLimit(request, 'system-health', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const h = await getSystemHealth();
  return NextResponse.json(
    { ok: true, timestamp: h.timestamp, database: h.database, edgeConfig: h.edgeConfig, runtime: h.runtime },
    { headers: { 'cache-control': 'no-store' } },
  );
}
