// =============================================================================
// @hsi/source-connectors — capture policy guardrails (enforced in code).
// HSI ETHICS: PUBLIC PAGES ONLY. We never bypass authentication, never capture
// private/login-gated content, and never target private individuals. These
// guards run BEFORE any network request a connector makes.
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
 * Assert that capturing `url` is within HSI's public-only policy.
 * Throws CapturePolicyError when the target looks private/auth-gated or when
 * credentials are embedded (which would imply a login bypass).
 *
 * This is a guardrail, not a guarantee — connectors must ALSO respect
 * robots.txt and must not log in. Capture only what an anonymous public visitor
 * could see.
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
  // Embedded credentials => an attempt to access a non-public surface.
  if (parsed.username || parsed.password) {
    throw new CapturePolicyError('Capture URLs must not contain credentials (login bypass is prohibited).');
  }
  const lower = (parsed.pathname + parsed.search).toLowerCase();
  for (const marker of PRIVATE_URL_MARKERS) {
    if (lower.includes(marker)) {
      throw new CapturePolicyError(
        `Refusing to capture an apparently private/authenticated surface (matched "${marker}"). PUBLIC PAGES ONLY.`,
      );
    }
  }
}

/**
 * Minimal robots.txt allow check. `robotsTxt` is the fetched body; pass the
 * user-agent and target path. Conservative: if a matching Disallow prefixes the
 * path, return false. Connectors should fetch robots.txt and consult this.
 */
export function isAllowedByRobots(robotsTxt: string, userAgent: string, path: string): boolean {
  if (!robotsTxt) return true; // No robots.txt => allowed.
  const lines = robotsTxt.split('\n').map((l) => l.trim());
  let applies = false;
  let allowed = true;
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.toLowerCase().trim();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      applies = value === '*' || userAgent.toLowerCase().includes(value.toLowerCase());
    } else if (applies && key === 'disallow') {
      if (value && path.startsWith(value)) allowed = false;
    } else if (applies && key === 'allow') {
      if (value && path.startsWith(value)) allowed = true;
    }
  }
  return allowed;
}
