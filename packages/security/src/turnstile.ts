// =============================================================================
// @hsi/security — Cloudflare Turnstile verification.
// Calls Cloudflare's siteverify endpoint. `fetch` is INJECTED so this is
// testable without network access and works in any runtime.
// =============================================================================

export interface TurnstileVerifyInput {
  /** The token returned by the Turnstile widget on the client. */
  token: string;
  secretKey: string;
  /** Optional end-user IP for additional validation. */
  remoteIp?: string;
}

export interface TurnstileVerifyResult {
  success: boolean;
  /** Cloudflare error codes, if any. */
  errorCodes: string[];
  /** Hostname Cloudflare reports the challenge was solved on. */
  hostname?: string;
  challengeTs?: string;
}

/** Minimal fetch shape so we don't depend on a DOM/Node fetch typing. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; json: () => Promise<any> }>;

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Turnstile token. Pass a fetch implementation (global fetch in prod,
 * a stub in tests).
 */
export async function verifyTurnstile(
  input: TurnstileVerifyInput,
  fetchImpl: FetchLike,
): Promise<TurnstileVerifyResult> {
  if (!input.token || !input.secretKey) {
    return { success: false, errorCodes: ['missing-input'] };
  }
  const body = new URLSearchParams({
    secret: input.secretKey,
    response: input.token,
  });
  if (input.remoteIp) body.set('remoteip', input.remoteIp);

  try {
    const res = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();
    return {
      success: Boolean(data?.success),
      errorCodes: Array.isArray(data?.['error-codes']) ? data['error-codes'] : [],
      hostname: data?.hostname,
      challengeTs: data?.challenge_ts,
    };
  } catch (err) {
    return { success: false, errorCodes: ['network-error', String((err as Error)?.message ?? err)] };
  }
}
