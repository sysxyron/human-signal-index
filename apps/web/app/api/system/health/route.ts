// =============================================================================
// HSI Phase 74.4 — GET /api/system/health. Public, READ-ONLY database +
// availability snapshot. Performs a single read-only DB probe (no writes). No
// secrets, tokens, cookies, user data, connection strings, or credentials.
// =============================================================================

import { NextResponse } from 'next/server';
import { getSystemHealth } from '@/lib/hsi/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const h = await getSystemHealth();
  return NextResponse.json(
    { ok: true, timestamp: h.timestamp, database: h.database, edgeConfig: h.edgeConfig, runtime: h.runtime },
    { headers: { 'cache-control': 'no-store' } },
  );
}
