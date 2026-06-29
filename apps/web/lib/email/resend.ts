// =============================================================================
// HSI Milestone 87 — transactional email (Resend) — SERVER-ONLY.
//
// A dependency-free Resend client: it POSTs to the Resend REST API with the
// global fetch, so no new npm package is added. It is ENV-GATED and degrades
// GRACEFULLY — when RESEND_API_KEY / RESEND_FROM are absent it returns
// { ok:false, skipped:true } and sends nothing (callers treat email as
// best-effort and never fail a request because email is unconfigured).
//
// The pure parts (config detection, payload building) are unit-tested; sending is
// tested with an injected fetch. No secret is ever logged or returned.
// =============================================================================

import { logError } from '@/lib/errors/format-error';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface EmailConfig {
  apiKey?: string;
  from?: string;
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true } // not configured → no-op (not an error)
  | { ok: false; skipped: false; error: string };

/** Minimal fetch surface so tests can inject a fake without DOM types. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** Resolve email config from an env map (defaults to process.env on the server). */
export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  return { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM };
}

/** True only when both an API key and a verified `from` address are present. */
export function isEmailConfigured(cfg: EmailConfig = emailConfig()): boolean {
  return Boolean(cfg.apiKey && cfg.apiKey.trim().length > 0 && cfg.from && cfg.from.trim().length > 0);
}

/** Build the Resend REST payload (pure; no I/O). */
export function buildResendPayload(from: string, msg: EmailMessage): Record<string, unknown> {
  return {
    from,
    to: Array.isArray(msg.to) ? msg.to : [msg.to],
    subject: msg.subject,
    text: msg.text,
    ...(msg.html ? { html: msg.html } : {}),
    ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
  };
}

/**
 * Send one transactional email. Best-effort and never throws:
 *   - unconfigured        → { ok:false, skipped:true }
 *   - transport/API error → { ok:false, skipped:false, error } (detail logged server-side)
 *   - success             → { ok:true, id }
 */
export async function sendEmail(
  msg: EmailMessage,
  opts: { config?: EmailConfig; fetchImpl?: FetchLike } = {},
): Promise<SendResult> {
  const cfg = opts.config ?? emailConfig();
  if (!isEmailConfigured(cfg)) return { ok: false, skipped: true };

  const doFetch = (opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  try {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey as string}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildResendPayload(cfg.from as string, msg)),
    });
    if (!res.ok) {
      logError('email/resend', `Resend API responded with status ${res.status}`);
      return { ok: false, skipped: false, error: `Email delivery failed (status ${res.status}).` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, id: typeof data?.id === 'string' ? data.id : null };
  } catch (e) {
    logError('email/resend', e);
    return { ok: false, skipped: false, error: 'Email delivery failed.' };
  }
}
