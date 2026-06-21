// =============================================================================
// HSI Phase 74.1 — GET /api/system/edge-config. Public, read-only view of the
// resolved runtime flags (no secrets). Reports `source` so callers can tell
// whether values came from Edge Config, defaults, or an error fallback.
// =============================================================================

import { NextResponse } from 'next/server';
import { getHsiRuntimeConfig } from '@/lib/hsi/edge-config';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { source, ...config } = await getHsiRuntimeConfig();
  return NextResponse.json(
    { ok: true, source, config, updatedAt: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
