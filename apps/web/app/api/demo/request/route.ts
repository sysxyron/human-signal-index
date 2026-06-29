// =============================================================================
// HSI Milestone 86/87 — Demo request intake (WIRED).
//
// validate → persist (best-effort, dedup by email) → notify (best-effort email)
// → success. Demo requests are buyer-oriented; the admin notice routes them to the
// phone-close queue (BETA_NOTIFY_EMAIL / DEMO_NOTIFY_EMAIL). Persistence + email are
// BEST-EFFORT: a missing service-role key or unconfigured Resend never fails the
// request. Never throws to the client; never logs PII.
// =============================================================================

import { NextResponse } from 'next/server';
import { validateDemoRequest } from '@/lib/beta-intake/intake';
import { persistDemoRequest } from '@/lib/beta-intake/persistence';
import { sendEmail } from '@/lib/email/resend';
import { demoRequestAck, demoRequestAdminNotice } from '@/lib/email/templates';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { isDisposableEmail } from '@/lib/validation/email';
import { logError } from '@/lib/errors/format-error';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Abuse dampener: cap submissions per client IP (best-effort, per-instance).
  const limited = enforceRateLimit(req, 'demo-request', { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 }); }

  const validated = validateDemoRequest(body);
  if (!validated.ok) {
    logError('demo/request', `validation rejected (${validated.errors.length} issue(s))`);
    return NextResponse.json({ ok: false, error: validated.errors.join(' ') }, { status: 422 });
  }
  const demo = validated.value;

  if (isDisposableEmail(demo.email)) {
    logError('demo/request', 'rejected disposable email domain');
    return NextResponse.json({ ok: false, error: 'Please use a permanent work email address.' }, { status: 422 });
  }

  await persistDemoRequest(demo).catch(() => undefined);

  const adminTo = (process.env.DEMO_NOTIFY_EMAIL ?? process.env.BETA_NOTIFY_EMAIL ?? '').trim();
  const data = { name: demo.name, email: demo.email, organization: demo.organization, useCase: demo.useCase };
  await Promise.allSettled([
    sendEmail(demoRequestAck(data)),
    ...(adminTo ? [sendEmail(demoRequestAdminNotice(data, adminTo))] : []),
  ]);

  return NextResponse.json({ ok: true, message: 'Thanks — your demo request has been received. A member of the team will reach out to schedule a walkthrough.' });
}
