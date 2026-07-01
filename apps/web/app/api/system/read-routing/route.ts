// =============================================================================
// HSI Phase 74.2 — GET /api/system/read-routing. Public, read-only view of the
// resolved read-routing decisions per scope + backend availability. Effective
// backend is always primary today. No secrets.
// =============================================================================

import { NextResponse } from 'next/server';
import { resolveReadBackend, availabilityFromHealth } from '@/lib/hsi/read-backends';
import { getHsiRuntimeConfig } from '@/lib/hsi/edge-config';
import { enforceRateLimit } from '@/lib/api-rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  // Unauthenticated + resolves backend health → rate-limit to prevent probe amplification.
  const limited = enforceRateLimit(request, 'system-read-routing', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const [pub, dashboard, admin, cfg] = await Promise.all([
    resolveReadBackend('public'),
    resolveReadBackend('dashboard'),
    resolveReadBackend('admin'),
    getHsiRuntimeConfig(),
  ]);
  const backends = availabilityFromHealth(cfg.primaryDbHealth);
  return NextResponse.json(
    { ok: true, routing: { public: pub, dashboard, admin }, backends, timestamp: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
