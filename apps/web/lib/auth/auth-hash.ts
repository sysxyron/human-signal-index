// =============================================================================
// Auth hash detection (Phase 24C-C) — PURE.
//
// Supabase email links generated outside the app (e.g. magic links that inherit
// the project Site URL) can land on the homepage with the session in the URL
// HASH (#access_token=…&type=magiclink) instead of /auth/callback. These helpers
// detect such a hash and compute where to forward it — preserving the hash
// EXACTLY — so the verified /auth/callback handler can establish the session.
//
// PURE: no DOM, no imports, no I/O. Used by the client AuthHashForwarder and the
// tests. Tokens are only inspected for routing; they are never logged or stored.
// =============================================================================

/** The callback path implicit/PKCE auth hashes are forwarded to. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** Normalise a raw `location.hash` (with or without the leading '#'). */
function stripHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

/**
 * True when `hash` carries Supabase auth material that should be handled by the
 * callback — implicit-flow tokens (access_token/refresh_token), an auth `type`
 * (magiclink/invite/recovery), or an error. Returns false for any ordinary
 * homepage hash (anchors, empty, unrelated query-like fragments).
 */
export function isAuthHash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  const body = stripHash(hash);
  if (body.length === 0) return false;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(body);
  } catch {
    return false;
  }
  if (params.has('access_token') || params.has('refresh_token')) return true;
  if (params.has('error') || params.has('error_description') || params.has('error_code')) return true;
  const type = params.get('type');
  if (type === 'magiclink' || type === 'invite' || type === 'recovery') return true;
  return false;
}

/**
 * The path (incl. the preserved hash) to forward an auth hash to, or null when
 * the hash is not an auth hash. The hash is preserved EXACTLY (with a single
 * leading '#') so no token is lost.
 */
export function authHashForwardPath(hash: string | null | undefined): string | null {
  if (!isAuthHash(hash)) return null;
  const body = stripHash(hash as string);
  return `${AUTH_CALLBACK_PATH}#${body}`;
}
