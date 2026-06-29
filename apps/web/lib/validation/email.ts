// =============================================================================
// HSI Security Hotfix — email format + disposable-domain checks (PURE).
//
// Reuses the same minimal email shape used by intake, and adds a CONFIGURABLE
// disposable-domain denylist. We do NOT hardcode thousands of domains: a small
// seed of well-known throwaway providers ships in code, and operators extend it
// via the DISPOSABLE_EMAIL_DOMAINS env var (comma/space/newline separated).
//
// PURITY: no I/O. `disposableDenylist(env)` takes the env map so it stays testable
// and isomorphic. Never throws.
// =============================================================================

/** Minimal email shape (same rule used across intake — single source of truth). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: unknown): boolean {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

/** Lower-cased domain part of an email, or '' when not parseable. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

// A SMALL seed of well-known disposable/throwaway providers. Intentionally short —
// the operator-configured env list is the primary control; this is a sensible
// default so the feature is useful out of the box.
export const DEFAULT_DISPOSABLE_DOMAINS: readonly string[] = [
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'getnada.com',
  'trashmail.com',
  'sharklasers.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
];

/**
 * Resolve the active denylist: the default seed plus any domains configured via
 * DISPOSABLE_EMAIL_DOMAINS. Values are normalized (lower-cased, leading '@'/'.'
 * stripped). Returns a Set for O(1) lookups.
 */
export function disposableDenylist(env: Record<string, string | undefined> = process.env): Set<string> {
  const set = new Set<string>(DEFAULT_DISPOSABLE_DOMAINS);
  const configured = env.DISPOSABLE_EMAIL_DOMAINS ?? '';
  for (const raw of configured.split(/[\s,]+/)) {
    const d = raw.trim().toLowerCase().replace(/^[@.]+/, '');
    if (d.length > 0) set.add(d);
  }
  return set;
}

/**
 * True when the email's domain (or any parent domain) is on the denylist.
 * Subdomain match: `foo.mailinator.com` is caught by `mailinator.com`.
 */
export function isDisposableEmail(
  email: string,
  denylist: Set<string> = disposableDenylist(),
): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (denylist.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) {
    if (denylist.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}
