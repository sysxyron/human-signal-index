// =============================================================================
// HSI Milestone 86/87 — Beta application intake (WIRED).
//
// validate → persist (best-effort, dedup by email) → notify (best-effort email)
// → success. Persistence + email are BEST-EFFORT: a missing service-role key or
// unconfigured Resend never fails the request — the user always gets a success
// message (the form must not break on infra gaps). Never throws to the client;
// never logs PII. Gated by the betaSignupOpen runtime flag (Edge Config).
// =============================================================================

import { NextResponse } from 'next/server';
import { getRuntimeFlag } from '@/lib/hsi/edge-config';
import { validateBetaApplication } from '@/lib/beta-intake/intake';
import { persistBetaApplication } from '@/lib/beta-intake/persistence';
import { sendEmail } from '@/lib/email/resend';
import { betaApplicationAck, betaApplicationAdminNotice } from '@/lib/email/templates';
import { enforceRateLimit } from '@/lib/api-rate-limit';
import { isDisposableEmail } from '@/lib/validation/email';
import { logError } from '@/lib/errors/format-error';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Abuse dampener: cap submissions per client IP (best-effort, per-instance).
  const limited = enforceRateLimit(req, 'beta-apply', { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  // Runtime flag: beta signup can be paused via Edge Config without a redeploy.
  if (!(await getRuntimeFlag('betaSignupOpen'))) {
    return NextResponse.json({ ok: false, code: 'BETA_CLOSED', message: 'Beta applications are temporarily paused.' }, { status: 423 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 }); }

  const validated = validateBetaApplication(body);
  if (!validated.ok) {
    // Server-side only; generic reason + count, never the raw payload/PII.
    logError('beta/apply', `validation rejected (${validated.errors.length} issue(s))`);
    return NextResponse.json({ ok: false, error: validated.errors.join(' ') }, { status: 422 });
  }
  const app = validated.value;

  // Reject disposable / throwaway email domains (env-configurable denylist).
  if (isDisposableEmail(app.email)) {
    logError('beta/apply', 'rejected disposable email domain');
    return NextResponse.json({ ok: false, error: 'Please use a permanent email address.' }, { status: 422 });
  }

  // Persist (best-effort, dedup). A duplicate within the window is still a success
  // for the user; only a hard infra absence degrades to validate-only.
  await persistBetaApplication(app).catch(() => undefined);

  // Notify (best-effort). allSettled so neither email can throw out of the handler.
  const adminTo = (process.env.BETA_NOTIFY_EMAIL ?? '').trim();
  const data = { name: app.name, email: app.email, role: app.role, reason: app.reason, organization: app.organization };
  await Promise.allSettled([
    sendEmail(betaApplicationAck(data)),
    ...(adminTo ? [sendEmail(betaApplicationAdminNotice(data, adminTo))] : []),
  ]);

  return NextResponse.json({ ok: true, message: 'Thanks — your beta application has been received. We review applications in batches and will email you about next steps.' });
}
