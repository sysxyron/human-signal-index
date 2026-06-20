// =============================================================================
// HSI Phase 73.1 — Demo request intake (PLACEHOLDER, safe). Validates the request
// and returns a success message. It does NOT persist or email anyone yet — wire
// a backend below. Never exposes secrets; never throws to the client.
//
// TODO(backend): choose ONE when infra is ready —
//   • Supabase: insert into a `demo_requests` table (admin-read RLS).
//   • Resend: email the request to sales@humansignalindex.org (RESEND_API_KEY).
//   • CRM: forward to a CRM/lead webhook (CRM_DEMO_WEBHOOK_URL) for phone follow-up.
// Demo requests are buyer-oriented — route them to the phone-close queue (see docs).
// =============================================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface DemoRequest {
  name?: unknown; email?: unknown; organization?: unknown; role?: unknown;
  teamSize?: unknown; useCase?: unknown; timeline?: unknown; notes?: unknown;
}

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

export async function POST(req: Request) {
  let body: DemoRequest;
  try { body = (await req.json()) as DemoRequest; } catch { return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 }); }

  const name = str(body.name); const email = str(body.email); const organization = str(body.organization); const useCase = str(body.useCase);
  const errors: string[] = [];
  if (!name) errors.push('Name is required.');
  if (!email || !EMAIL.test(email)) errors.push('A valid work email is required.');
  if (!organization) errors.push('Organization is required.');
  if (!useCase) errors.push('Tell us your use case.');
  if (errors.length > 0) return NextResponse.json({ ok: false, error: errors.join(' ') }, { status: 422 });

  // TODO(backend): persist/forward the validated request + route to phone-close
  // queue here. Intentionally a no-op today so the form works before infra exists.
  return NextResponse.json({ ok: true, message: 'Thanks — your demo request has been received. A member of the team will reach out to schedule a walkthrough.' });
}
