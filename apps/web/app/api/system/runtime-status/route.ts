// =============================================================================
// HSI Phase 74.3 — GET /api/system/runtime-status. Public, READ-ONLY snapshot of
// current runtime flags, read-routing decisions, backend availability, and a
// human summary. No secrets, tokens, cookies, user data, connection strings, or
// credentials. No mutations.
// =============================================================================

import { NextResponse } from 'next/server';
import { getRuntimeStatus } from '@/lib/operations-runtime/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getRuntimeStatus();
  return NextResponse.json(
    { ok: true, timestamp: s.timestamp, runtime: s.runtime, routing: s.routing, availability: s.availability, summary: s.summary },
    { headers: { 'cache-control': 'no-store' } },
  );
}
