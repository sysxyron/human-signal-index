// =============================================================================
// HSI Phase 73.1 — Beta application intake (PLACEHOLDER, safe). Validates the
// submission and returns a success message. It does NOT persist or email anyone
// yet — wire a backend below. Never exposes secrets; never throws to the client.
//
// TODO(backend): choose ONE when infra is ready —
//   • Supabase: insert into a `beta_applications` table (reuse the Phase 60
//     beta-launch admin client + RLS; admin-read only). See lib/beta-launch.
//   • Resend: email the application to beta@humansignalindex.org (RESEND_API_KEY).
//   • CRM: forward to a CRM intake webhook (CRM_BETA_WEBHOOK_URL).
// Until then this endpoint is intentionally a no-op success so the UX never breaks.
// =============================================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface BetaApplication {
  name?: unknown; email?: unknown; organization?: unknown; role?: unknown;
  areaOfInterest?: unknown; reason?: unknown; experience?: unknown; preferredRole?: unknown;
}

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

export async function POST(req: Request) {
  let body: BetaApplication;
  try { body = (await req.json()) as BetaApplication; } catch { return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 }); }

  const name = str(body.name); const email = str(body.email); const role = str(body.role); const reason = str(body.reason);
  const errors: string[] = [];
  if (!name) errors.push('Name is required.');
  if (!email || !EMAIL.test(email)) errors.push('A valid email is required.');
  if (!role) errors.push('Tell us your role or background.');
  if (!reason) errors.push('Tell us why you want to test HSI.');
  if (errors.length > 0) return NextResponse.json({ ok: false, error: errors.join(' ') }, { status: 422 });

  // TODO(backend): persist/forward the validated application here. Intentionally
  // a no-op today so the form works before infra exists. Do not log PII.
  return NextResponse.json({ ok: true, message: 'Thanks — your beta application has been received. We review applications in batches and will email you about next steps.' });
}
