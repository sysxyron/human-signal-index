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
