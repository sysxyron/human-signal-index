// =============================================================================
// HSI Phase 40B — protected cron endpoint: /api/cron/source-capture
//
// Runs the source-capture batch over all DUE, monitored, active sources and
// returns a summary. This is the PRODUCTION trigger that makes added sources
// flow automatically: Source → Capture → Snapshot → Diff → Capture Event →
// Signal → Signals UI.
//
// SECURITY:
//   * Guarded by CRON_SECRET (Authorization: Bearer / x-cron-secret / ?secret).
//     Fails closed when the secret is missing or wrong (401 / 503).
//   * Uses the SERVICE-ROLE client (server-only) — capture runs with no user
//     session, so RLS is bypassed deliberately and ALL writes are audited via
//     source_capture_events + hsin_signal_events. The service-role key never
//     leaves the server (this is a route handler, never bundled to the client).
//   * Touches NO RBAC / auth / billing tables.
//
// RUNTIME: nodejs (uses node:crypto); force-dynamic; never auto-published.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@hsi/database';
import { isCronAuthorized } from '@/lib/cron/auth';
import {
  createServerFetchText,
  createSupabaseCapturePersistence,
  runSourceCaptureBatch,
} from '@/lib/signals/source-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Capture can fan out over many sources; allow a generous budget on Vercel.
export const maxDuration = 300;

async function handle(request: NextRequest): Promise<NextResponse> {
  // 1. Authorize.
  const url = new URL(request.url);
  const authorized = isCronAuthorized(
    {
      authorization: request.headers.get('authorization'),
      cronSecretHeader: request.headers.get('x-cron-secret'),
      querySecret: url.searchParams.get('secret'),
    },
    process.env.CRON_SECRET,
  );
  if (!authorized) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  // 2. Build the service-role client (fails closed when unconfigured).
  let client;
  try {
    client = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Source capture is not configured (SUPABASE_SERVICE_ROLE_KEY missing).',
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }

  // 3. Run the batch.
  const now = new Date().toISOString();
  const dueOnly = url.searchParams.get('all') !== 'true'; // ?all=true ignores intervals
  try {
    const persistence = createSupabaseCapturePersistence(client);
    const summary = await runSourceCaptureBatch(persistence, {
      fetchText: createServerFetchText(),
      now,
      dueOnly,
    });
    return NextResponse.json({
      ok: true,
      runAt: now,
      summary: {
        sourcesChecked: summary.sourcesChecked,
        sourcesSkipped: summary.sourcesSkipped,
        capturesSucceeded: summary.capturesSucceeded,
        capturesFailed: summary.capturesFailed,
        signalsCreated: summary.signalsCreated,
        snapshotsCreated: summary.snapshotsCreated,
        diffsCreated: summary.diffsCreated,
      },
      results: summary.results,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** Vercel Cron invokes via GET. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

/** Manual / external schedulers may POST. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
