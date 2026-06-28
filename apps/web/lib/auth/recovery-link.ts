// =============================================================================
// Recovery-link classification (PURE) — password-reset / update-password.
//
// Supabase PKCE recovery links verify at the Auth server and redirect back to
// `/update-password` with a `?code=…` that must be exchanged for a session
// (exchangeCodeForSession) BEFORE updateUser({ password }) can run. Older
// implicit links instead carry `#access_token=…&refresh_token=…` (setSession).
// Expired/invalid links carry `error`/`error_description`. This helper inspects
// the URL's query + hash and decides which session-establishing action to take,
// so the page can gate the password form on a confirmed session.
//
// PURE: no DOM, no imports, no I/O. Tokens are inspected only to choose an
// action; they are never logged, rendered, or stored by this module.
// =============================================================================

/** Friendly copy for a link that cannot establish a recovery session. */
export const INVALID_RECOVERY_LINK_MESSAGE =
  'This password reset link is expired or invalid. Please request a new reset link.';

/** The recovery `type` values Supabase uses for this flow. */
export type RecoveryType = 'recovery' | 'invite';

export type RecoveryAction =
  // The link carried a provider/verification error → no usable session.
  | { kind: 'error'; message: string; type: RecoveryType | null }
  // PKCE: exchange this code for a session.
  | { kind: 'code'; code: string; type: RecoveryType | null }
  // Implicit: set the session from the hash tokens.
  | { kind: 'hash'; accessToken: string; refreshToken: string; type: RecoveryType | null }
  // No code/hash present → fall back to checking for an existing session
  // (e.g. /auth/callback already established it before redirecting here).
  | { kind: 'session'; type: RecoveryType | null };

function strip(prefix: string, value: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function parse(part: string | null | undefined, lead: string): URLSearchParams {
  if (!part) return new URLSearchParams();
  try {
    return new URLSearchParams(strip(lead, part));
  } catch {
    return new URLSearchParams();
  }
}

function readType(query: URLSearchParams, hash: URLSearchParams): RecoveryType | null {
  const t = query.get('type') ?? hash.get('type');
  return t === 'recovery' || t === 'invite' ? t : null;
}

/**
 * Decide how to establish the recovery session from the current URL.
 * `search` is `location.search` ("?…"), `hash` is `location.hash` ("#…");
 * either may be passed with or without its leading punctuation.
 */
export function classifyRecoveryLink(search: string | null | undefined, hash: string | null | undefined): RecoveryAction {
  const query = parse(search, '?');
  const frag = parse(hash, '#');
  const type = readType(query, frag);

  // 1) Provider/verification error in either query or hash → not usable.
  const errDesc = query.get('error_description') || frag.get('error_description');
  const errCode = query.get('error') || frag.get('error');
  if (errDesc || errCode) {
    return { kind: 'error', message: errDesc || INVALID_RECOVERY_LINK_MESSAGE, type };
  }

  // 2) PKCE code (the current production recovery format).
  const code = query.get('code');
  if (code) return { kind: 'code', code, type };

  // 3) Implicit-flow hash tokens.
  const accessToken = frag.get('access_token');
  const refreshToken = frag.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'hash', accessToken, refreshToken, type };

  // 4) Nothing in the URL — check for a pre-established session.
  return { kind: 'session', type };
}
