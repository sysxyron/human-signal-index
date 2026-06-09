// =============================================================================
// Auth error translation + Cloudflare challenge detection — PURE.
//
// Turns a Supabase/GoTrue/network error into a READABLE, user-facing message so
// auth flows NEVER surface a bare "Failed to fetch" or "[object Object]". Also
// detects Cloudflare / anti-bot challenge HTML (the classic failure mode when a
// WAF rule intercepts the /auth/ endpoint and returns a "Just a moment..." page
// instead of JSON).
//
// PURITY: imports ONLY ./errors/format-error (also pure). No next/*, no Supabase
// client, no server-only modules, no Date.now()/Math.random(). Import-safe in a
// plain node/tsx test.
// =============================================================================

import { formatErrorMessage } from '../errors/format-error';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Pull a candidate text blob out of anything that might carry challenge HTML:
 * a raw string, an Error/{message}, or a Response-like object with statusText.
 */
function extractText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message;
  if (isRecord(input)) {
    const parts: string[] = [];
    for (const key of ['message', 'msg', 'body', 'bodyText', 'text', 'statusText', 'error', 'error_description']) {
      const v = input[key];
      if (typeof v === 'string') parts.push(v);
    }
    // Response-like header map (cf-mitigated lives in headers).
    const headers = input.headers;
    if (isRecord(headers)) {
      for (const hk of Object.keys(headers)) {
        const hv = headers[hk];
        if (typeof hv === 'string') parts.push(`${hk}: ${hv}`);
      }
    }
    return parts.join('\n');
  }
  return '';
}

// Markers that strongly indicate a Cloudflare / anti-bot interstitial.
const CLOUDFLARE_MARKERS: RegExp[] = [
  /just a moment/i,
  /cf-challenge/i,
  /cf[-_]chl/i,
  /__cf_chl/i,
  /cf-mitigated/i,
  /attention required/i,
  /checking your browser/i,
  /enable javascript and cookies/i,
  /\bhcaptcha\b/i,
  /\bturnstile\b/i,
  /challenge-platform/i,
  /ray id/i,
];

/**
 * True when the input (response body/text/error message/Response-like object)
 * looks like a Cloudflare / anti-bot challenge page rather than a real API
 * response. Deterministic, accepts string | { message?, ... } | Response-like.
 */
export function isCloudflareChallenge(input: unknown): boolean {
  const text = extractText(input);
  if (!text) return false;
  return CLOUDFLARE_MARKERS.some((re) => re.test(text));
}

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'cloudflare_challenge'
  | 'network'
  | 'cors'
  | 'auth_endpoint_blocked'
  | 'rest_endpoint_blocked'
  | 'config_missing'
  | 'invalid_token'
  | 'expired_session'
  | 'rate_limited'
  | 'unknown';

export interface TranslatedAuthError {
  kind: AuthErrorKind;
  message: string;
  hint?: string;
}

/** Read a numeric status off an Error/Response-like/GoTrue object. */
function extractStatus(error: unknown): number | undefined {
  if (isRecord(error)) {
    const s = error.status ?? error.statusCode ?? error.code;
    if (typeof s === 'number') return s;
    if (typeof s === 'string' && /^\d+$/.test(s)) return Number(s);
  }
  return undefined;
}

/**
 * Translate a Supabase/GoTrue/network error into a readable user-facing message.
 * NEVER returns a bare "Failed to fetch" or "[object Object]". The unknown
 * fallback is composed from formatErrorMessage so PostgREST/auth objects still
 * surface their real message.
 */
export function translateAuthError(
  error: unknown,
  ctx?: { route?: string },
): TranslatedAuthError {
  const route = ctx?.route ?? '/auth/';
  const text = extractText(error);
  const status = extractStatus(error);
  const isTypeError = error instanceof TypeError;

  // Cloudflare challenge first — it can masquerade as any other failure.
  if (isCloudflareChallenge(error)) {
    return {
      kind: 'cloudflare_challenge',
      message: `Cloudflare challenge detected on ${route} route.`,
      hint: 'Add a Cloudflare WAF skip rule for /auth/.',
    };
  }

  // CORS — browser blocked the cross-origin request.
  if (/\bcors\b|cross-origin|access-control-allow-origin|blocked by cors/i.test(text)) {
    return {
      kind: 'cors',
      message: 'Browser blocked the request (CORS).',
      hint: 'Check the Supabase project URL and allowed origins / redirect URLs.',
    };
  }

  // Network — "Failed to fetch" / "fetch failed" / TypeError with no HTTP status.
  if (
    (status === undefined && (isTypeError || /failed to fetch|fetch failed|networkerror|load failed/i.test(text))) ||
    /enotfound|econnrefused|etimedout|network request failed/i.test(text)
  ) {
    return {
      kind: 'network',
      message: 'Cannot reach Supabase Auth endpoint.',
      hint: 'Check NEXT_PUBLIC_SUPABASE_URL and your network.',
    };
  }

  // Rate limited.
  if (status === 429 || /rate limit|too many requests|too many attempts/i.test(text)) {
    return {
      kind: 'rate_limited',
      message: 'Too many attempts — please wait and try again.',
    };
  }

  // Email not confirmed.
  if (/email not confirmed|email_not_confirmed|confirm your email|email address is not confirmed/i.test(text)) {
    return {
      kind: 'email_not_confirmed',
      message: 'Email not confirmed.',
      hint: 'Check your inbox for the confirmation link.',
    };
  }

  // Invalid credentials (GoTrue: "Invalid login credentials" / invalid_grant).
  if (/invalid login credentials|invalid_grant|invalid email or password|invalid credentials/i.test(text)) {
    return {
      kind: 'invalid_credentials',
      message: 'Invalid email or password.',
    };
  }

  // Expired session / refresh failure.
  if (/expired|jwt expired|refresh token|session_not_found|token has expired/i.test(text)) {
    return {
      kind: 'expired_session',
      message: 'Your session has expired — please sign in again.',
    };
  }

  // Invalid / missing token → 401.
  if (status === 401 || /invalid token|invalid jwt|invalid claim|unauthorized|no api key|jwt malformed|bad_jwt/i.test(text)) {
    return {
      kind: 'invalid_token',
      message: 'Your session token is invalid.',
      hint: 'Sign out and sign in again.',
    };
  }

  // Missing configuration (placeholder env detected upstream).
  if (/anon-placeholder|127\.0\.0\.1:54321|not configured|missing.*supabase|supabase.*missing/i.test(text)) {
    return {
      kind: 'config_missing',
      message: 'Supabase is not configured.',
      hint: 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }

  // Endpoint-blocked classification (5xx / 5xx-on-auth vs rest).
  if (typeof status === 'number' && status >= 500) {
    const isRest = /\/rest\//.test(route);
    return {
      kind: isRest ? 'rest_endpoint_blocked' : 'auth_endpoint_blocked',
      message: isRest
        ? `Supabase REST endpoint returned an error (${status}).`
        : `Supabase Auth endpoint returned an error (${status}).`,
      hint: 'Check Supabase status and any WAF/proxy in front of it.',
    };
  }

  // Unknown fallback — compose with formatErrorMessage so we NEVER show a bare
  // "Failed to fetch" or "[object Object]".
  const formatted = formatErrorMessage(error);
  if (/failed to fetch/i.test(formatted) || /\[object Object\]/.test(formatted)) {
    return {
      kind: 'network',
      message: 'Cannot reach Supabase Auth endpoint.',
      hint: 'Check NEXT_PUBLIC_SUPABASE_URL and your network.',
    };
  }
  return { kind: 'unknown', message: formatted };
}
