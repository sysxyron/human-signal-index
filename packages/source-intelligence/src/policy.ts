// =============================================================================
// @hsi/source-intelligence — capture policy guardrails.
//
// HSI ETHICS: PUBLIC INFORMATION ONLY. We never bypass authentication, never
// capture private/login-gated content, never enter private communities, and
// never target private individuals. This guard runs BEFORE any network request.
//
// This mirrors @hsi/source-connectors' policy. We re-export the canonical guard
// from that package when resolvable, but also ship a self-contained copy so this
// engine enforces the policy even if used standalone.
// =============================================================================

export class CapturePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapturePolicyError';
  }
}

/** URL substrings that strongly indicate authenticated / private surfaces. */
const PRIVATE_URL_MARKERS = [
  '/login', '/signin', '/sign-in', '/account', '/admin', '/dashboard',
  '/settings', '/messages', '/dm/', '/inbox', '/checkout', 'auth=', 'token=',
  'session=', 'password',
];

/** Schemes we will not capture. */
const DISALLOWED_PROTOCOLS = ['file:', 'ftp:', 'data:'];

/**
 * SSRF guard: reject hostnames / IP literals in non-public address space —
 * loopback, RFC1918, CGNAT, and link-local (incl. the cloud metadata endpoint
 * 169.254.169.254). PURE + literal-only (no DNS). Mirrors the canonical guard in
 * @hsi/source-connectors' policy.
 */
export function isBlockedCaptureHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (h.length === 0) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return true;
  const v4 = h.startsWith('::ffff:') ? h.slice(7) : h;
  const m = v4.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a === 0 || a === 127) return true;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

/**
 * Assert that capturing `url` is within HSI's public-only policy.
 * Throws CapturePolicyError when the target looks private/auth-gated or when
 * credentials are embedded (which would imply a login bypass).
 *
 * Guardrail, not a guarantee — providers must ALSO respect robots.txt and must
 * never log in. Capture only what an anonymous public visitor could see.
 */
export function assertPublicCapturePolicy(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CapturePolicyError(`Invalid capture URL: ${url}`);
  }

  if (DISALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    throw new CapturePolicyError(`Disallowed protocol for capture: ${parsed.protocol}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CapturePolicyError(`Only http(s) public pages may be captured: ${url}`);
  }
  if (parsed.username || parsed.password) {
    throw new CapturePolicyError(
      'Capture URLs must not contain credentials (login bypass is prohibited).',
    );
  }
  if (isBlockedCaptureHost(parsed.hostname)) {
    throw new CapturePolicyError('Refusing to capture a private, loopback, or link-local address (SSRF guard). PUBLIC INFORMATION ONLY.');
  }
  const lower = (parsed.pathname + parsed.search).toLowerCase();
  for (const marker of PRIVATE_URL_MARKERS) {
    if (lower.includes(marker)) {
      throw new CapturePolicyError(
        `Refusing to capture an apparently private/authenticated surface (matched "${marker}"). PUBLIC INFORMATION ONLY.`,
      );
    }
  }
}

/** Non-throwing variant: returns true when the url is capturable. */
export function isPublicCaptureAllowed(url: string): boolean {
  try {
    assertPublicCapturePolicy(url);
    return true;
  } catch {
    return false;
  }
}
