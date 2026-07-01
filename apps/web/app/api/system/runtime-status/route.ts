// =============================================================================
// HSI Phase 74.3 — GET /api/system/runtime-status. Public, READ-ONLY snapshot of
// current runtime flags, read-routing decisions, backend availability, and a
// human summary. No secrets, tokens, cookies, user data, connection strings, or
// credentials. No mutations.
// =============================================================================

import { NextResponse } from 'next/server';
import { getRuntimeStatus } from '@/lib/operations-runtime/data';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Unauthenticated + surfaces database health → rate-limit to prevent probe amplification.
  const limited = enforceRateLimit(request, 'system-runtime-status', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const s = await getRuntimeStatus();
  return NextResponse.json(
    { ok: true, timestamp: s.timestamp, runtime: s.runtime, routing: s.routing, availability: s.availability, databaseHealth: s.databaseHealth, summary: s.summary },
    { headers: { 'cache-control': 'no-store' } },
  );
}
