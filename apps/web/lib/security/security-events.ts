// =============================================================================
// Security-event normalizer + constants — PURE (NO DB writes).
//
// Turns a loosely-typed security-event input into a normalized record mapped to
// the security_events DB column shape (event_type / severity / user_id /
// ip_address / user_agent / route / message / metadata / created_at). The actual
// INSERT lives in the server DAL — this module only shapes + defaults.
//
// PURITY: no imports. No next/*, no Supabase, no Date.now()/Math.random() — the
// caller supplies `now`.
// =============================================================================

export type SecurityEventType =
  | 'failed_login'
  | 'successful_login'
  | 'logout'
  | 'session_refresh_failure'
  | 'access_denied'
  | 'admin_page_access'
  | 'publication_action'
  | 'review_action'
  | 'health_check_failure'
  | 'cloudflare_challenge';

export type SecuritySeverity = 'info' | 'warning' | 'error' | 'critical';

/** Default severity per event type. */
export const DEFAULT_SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
  failed_login: 'warning',
  successful_login: 'info',
  logout: 'info',
  session_refresh_failure: 'error',
  access_denied: 'warning',
  admin_page_access: 'info',
  publication_action: 'info',
  review_action: 'info',
  health_check_failure: 'error',
  cloudflare_challenge: 'error',
};

// Default human-readable message per event type (used when none is supplied).
const DEFAULT_MESSAGE: Record<SecurityEventType, string> = {
  failed_login: 'A login attempt failed.',
  successful_login: 'A user signed in.',
  logout: 'A user signed out.',
  session_refresh_failure: 'Session refresh failed.',
  access_denied: 'Access to a protected resource was denied.',
  admin_page_access: 'An admin page was accessed.',
  publication_action: 'A publication action was performed.',
  review_action: 'A review action was performed.',
  health_check_failure: 'A health check failed.',
  cloudflare_challenge: 'A Cloudflare challenge was detected.',
};

const MAX_MESSAGE_LEN = 500;
const MAX_USER_AGENT_LEN = 512;

export interface NormalizeSecurityEventInput {
  eventType: SecurityEventType;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  /** ISO timestamp supplied by the caller (keeps this pure/deterministic). */
  now: string;
}

/** The DB column shape for the security_events table. */
export interface NormalizedSecurityEvent {
  event_type: SecurityEventType;
  severity: SecuritySeverity;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  route: string | null;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function nullableString(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Normalize a security-event input: derive the default severity for the event
 * type, fill a default message, truncate over-long fields, coerce metadata to an
 * object, and map everything to the DB column shape. created_at is the supplied
 * `now`. Pure + deterministic.
 */
export function normalizeSecurityEvent(
  input: NormalizeSecurityEventInput,
): NormalizedSecurityEvent {
  const eventType = input.eventType;
  const severity = DEFAULT_SEVERITY[eventType] ?? 'info';

  const rawMessage =
    input.message && input.message.trim().length > 0
      ? input.message.trim()
      : DEFAULT_MESSAGE[eventType] ?? 'Security event.';

  const metadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata
      : {};

  const userAgent = nullableString(input.userAgent);

  return {
    event_type: eventType,
    severity,
    user_id: nullableString(input.userId),
    ip_address: nullableString(input.ipAddress),
    user_agent: userAgent === null ? null : truncate(userAgent, MAX_USER_AGENT_LEN),
    route: nullableString(input.route),
    message: truncate(rawMessage, MAX_MESSAGE_LEN),
    metadata,
    created_at: input.now,
  };
}
