// =============================================================================
// HSI Phase 66 — protected cron endpoint: /api/cron/agents
//
// Runs every enabled agent whose schedule is DUE (deterministic, reuses the
// existing cron pattern). Service-role; CRON_SECRET-guarded; reads/analyzes only —
// agents never publish, review, moderate, or score truth. RUNTIME: nodejs.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceRoleClient } from '@hsi/database';
import { isCronAuthorized } from '@/lib/cron/auth';
import { runDueAgents } from '@/lib/agents/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const authorized = isCronAuthorized(
    { authorization: request.headers.get('authorization'), cronSecretHeader: request.headers.get('x-cron-secret'), querySecret: url.searchParams.get('secret') },
    process.env.CRON_SECRET,
  );
  if (!authorized) return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });

  let client;
  try { client = createServiceRoleClient(); } catch (e) {
    return NextResponse.json({ ok: false, error: 'Agent automation is not configured (SUPABASE_SERVICE_ROLE_KEY missing).', detail: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  try {
    const summary = await runDueAgents(client as never, new Date().toISOString(), null);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> { return handle(request); }
export async function POST(request: NextRequest): Promise<NextResponse> { return handle(request); }
