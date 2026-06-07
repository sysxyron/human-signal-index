// =============================================================================
// @hsi/security — security headers (Cloudflare / Vercel ready)
// CSP allows 'self' + Supabase (configurable origin). Returned as tuple pairs
// so it can be applied in Next.js headers(), middleware, or edge responses.
// =============================================================================

export interface SecurityHeaderOptions {
  /** Supabase project origin to allow in connect-src/img-src, e.g.
   *  https://xyzcompany.supabase.co. Derived from NEXT_PUBLIC_SUPABASE_URL. */
  supabaseUrl?: string;
  /** Extra origins to allow in connect-src (analytics, Turnstile, etc.). */
  extraConnectSrc?: string[];
  /** Set false in development to relax CSP (allow inline/eval for HMR). */
  production?: boolean;
}

function originOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Build a Content-Security-Policy string allowing self + Supabase. */
export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const supa = originOf(options.supabaseUrl);
  const supaWs = supa ? supa.replace(/^http/, 'ws') : undefined;
  const turnstile = 'https://challenges.cloudflare.com';

  const connect = ["'self'", supa, supaWs, turnstile, ...(options.extraConnectSrc ?? [])].filter(Boolean);
  const script = options.production
    ? ["'self'", turnstile]
    : ["'self'", "'unsafe-eval'", "'unsafe-inline'", turnstile];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': script as string[],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:', supa].filter(Boolean) as string[],
    'media-src': ["'self'", 'blob:', supa].filter(Boolean) as string[],
    'font-src': ["'self'", 'https:', 'data:'],
    'connect-src': connect as string[],
    'frame-src': ["'self'", turnstile],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Full set of security headers as [name, value] tuples.
 * Safe defaults for Vercel/Cloudflare-fronted Next.js apps.
 */
export function getSecurityHeaders(options: SecurityHeaderOptions = {}): readonly (readonly [string, string])[] {
  return [
    ['Content-Security-Policy', buildContentSecurityPolicy(options)],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-DNS-Prefetch-Control', 'off'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()'],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  ] as const;
}

/** Same headers as a plain object (handy for fetch Response init). */
export function getSecurityHeadersObject(options: SecurityHeaderOptions = {}): Record<string, string> {
  return Object.fromEntries(getSecurityHeaders(options).map(([k, v]) => [k, v]));
}
