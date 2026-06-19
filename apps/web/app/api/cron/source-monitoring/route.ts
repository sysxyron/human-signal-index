// =============================================================================
// HSI Phase 63 — protected cron endpoint: /api/cron/source-monitoring
//
// Runs the automated source-monitoring evaluation: classify every source from
// existing telemetry (Phase 61), persist state/transitions/alerts, and notify
// admins via the Phase 62 framework. This makes monitoring AUTOMATIC without
// touching ingestion — it reads telemetry only, never fetches or scrapes.
//
// SECURITY:
//   * Guarded by CRON_SECRET (Authorization: Bearer / x-cron-secret / ?secret).
//     Fails closed when the secret is missing or wrong (401 / 503).
//   * Uses the SERVICE-ROLE client (server-only) — runs with no user session, so
//     RLS is bypassed deliberately for the monitoring tables; the key never leaves
//     the server. Touches NO ingestion / RBAC / billing tables.
// RUNTIME: nodejs; force-dynamic.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@hsi/database';
import { isCronAuthorized } from '@/lib/cron/auth';
import { runSourceMonitoring } from '@/lib/source-monitoring/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const authorized = isCronAuthorized(
    {
      authorization: request.headers.get('authorization'),
      cronSecretHeader: request.headers.get('x-cron-secret'),
      querySecret: url.searchParams.get('secret'),
    },
    process.env.CRON_SECRET,
  );
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  let client;
  try {
    client = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'Source monitoring is not configured (SUPABASE_SERVICE_ROLE_KEY missing).', detail: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }

  try {
    const summary = await runSourceMonitoring(client as never, { notify: true, actorId: null });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> { return handle(request); }
export async function POST(request: NextRequest): Promise<NextResponse> { return handle(request); }
