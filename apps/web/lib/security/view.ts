// =============================================================================
// HSI Phase 14 — client-safe view helpers for the Admin Security dashboard.
//
// PURE + CLIENT-SAFE: no server-only imports (no next/headers, no Supabase
// server client, no actions/persistence/log modules). These map the Phase-14
// security telemetry unions → color/label, format timestamps, read typed values
// out of an untyped jsonb `details`/`metadata` bag WITHOUT `any`, and build a
// clearly-LABELED demo `SecurityDashboardData` so the dashboard renders fully
// offline when an action returns NOT_CONFIGURED. This is the ONLY mock.
// =============================================================================

import type {
  AccessDenialRecord,
  HealthCheckResult,
  HealthServiceStatus,
  LoginAttemptRecord,
  SecurityAuditEventRecord,
  SecurityDashboardData,
  SecurityEventSeverity,
  SecurityReviewStatus,
  SessionEventRecord,
} from '@hsi/shared-types';

/* -------------------------------------------------------------------------- */
/* Role gating (pure — safe in client + server).                              */
/* -------------------------------------------------------------------------- */

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  contributor: 1,
  researcher: 2,
  reviewer: 3,
  editor: 3,
  curator: 4,
  admin: 5,
  owner: 6,
};

/** The Security dashboard is ADMIN-only. */
export function isAdmin(role?: string | null): boolean {
  if (!role) return false;
  return (ROLE_RANK[role.toLowerCase()] ?? 0) >= ROLE_RANK.admin;
}

/* -------------------------------------------------------------------------- */
/* Color / tone vocabulary (aligned with the @hsi/ui token palette)           */
/* -------------------------------------------------------------------------- */

export interface Decor {
  label: string;
  color: string;
}

const COLOR = {
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  slate: '#94A3B8',
  blue: '#3B82F6',
  purple: '#8B5CF6',
} as const;

/** Health service status → label + color (ok=green, degraded=amber, down=red, unconfigured=slate). */
export function healthStatusDecor(status: HealthServiceStatus): Decor {
  switch (status) {
    case 'ok':
      return { label: 'Operational', color: COLOR.green };
    case 'degraded':
      return { label: 'Degraded', color: COLOR.amber };
    case 'down':
      return { label: 'Down', color: COLOR.red };
    case 'unconfigured':
    default:
      return { label: 'Unconfigured', color: COLOR.slate };
  }
}

/** Security-event severity → label + color. Critical/error are never "hidden" by tone. */
export function severityDecor(severity?: SecurityEventSeverity | string): Decor {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: COLOR.red };
    case 'error':
      return { label: 'Error', color: COLOR.amber };
    case 'warning':
      return { label: 'Warning', color: COLOR.amber };
    case 'info':
      return { label: 'Info', color: COLOR.blue };
    default:
      return { label: severity ? String(severity) : 'Unknown', color: COLOR.slate };
  }
}

/** Admin-review triage status → label + color. */
export function reviewStatusDecor(status?: SecurityReviewStatus | string): Decor {
  switch (status) {
    case 'open':
      return { label: 'Open', color: COLOR.blue };
    case 'reviewed':
      return { label: 'Reviewed', color: COLOR.green };
    case 'dismissed':
      return { label: 'Dismissed', color: COLOR.slate };
    case 'escalated':
      return { label: 'Escalated', color: COLOR.red };
    default:
      return { label: status ? String(status) : 'Open', color: COLOR.blue };
  }
}

/* -------------------------------------------------------------------------- */
/* Typed reads out of an untyped jsonb bag (no `any`).                         */
/* -------------------------------------------------------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Read a string field out of a details/metadata bag, or undefined. */
export function detailString(
  bag: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!bag) return undefined;
  const v = bag[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/** Read a numeric field (e.g. an HTTP status code) out of a details bag. */
export function detailNumber(
  bag: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!bag) return undefined;
  const v = bag[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return undefined;
}

/** Read a boolean flag (e.g. a Cloudflare-challenge marker) out of a details bag. */
export function detailBool(
  bag: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  if (!bag) return undefined;
  const v = bag[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true' || v === '1';
  return undefined;
}

/** The HTTP status code from a health check's details, if present. */
export function healthStatusCode(check: HealthCheckResult): number | undefined {
  return (
    detailNumber(check.details, 'status') ??
    detailNumber(check.details, 'statusCode') ??
    detailNumber(check.details, 'status_code') ??
    detailNumber(check.details, 'code')
  );
}

/**
 * Whether a single health check is flagging a Cloudflare challenge / HTML
 * interstitial in front of a programmatic endpoint. Checks several plausible
 * detail keys plus a `text/html` content-type heuristic.
 */
export function flagsCloudflareChallenge(check: HealthCheckResult): boolean {
  const d = check.details;
  if (!isRecord(d)) return false;
  if (
    detailBool(d, 'cloudflareChallenge') === true ||
    detailBool(d, 'cloudflare_challenge') === true ||
    detailBool(d, 'challenge') === true ||
    detailBool(d, 'cloudflare') === true
  ) {
    return true;
  }
  const contentType =
    detailString(d, 'contentType') ?? detailString(d, 'content_type') ?? '';
  if (/text\/html/i.test(contentType)) return true;
  const body = detailString(d, 'body') ?? detailString(d, 'snippet') ?? '';
  if (/just a moment|checking your browser|cf-chl|cloudflare/i.test(body)) return true;
  return false;
}

/** True when ANY health check flags a Cloudflare challenge. */
export function anyCloudflareChallenge(health: HealthCheckResult[]): boolean {
  return health.some(flagsCloudflareChallenge);
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** ISO timestamp → "YYYY-MM-DD HH:MM UTC". Tolerant of bad input. */
export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Redact-safe display for an email — actions already redact; render as-is or em-dash. */
export function displayOrDash(v?: string | null): string {
  return v && String(v).length > 0 ? String(v) : '—';
}

/* -------------------------------------------------------------------------- */
/* DEMO view-model (the ONLY mock) — clearly labeled.                          */
/* -------------------------------------------------------------------------- */

const DEMO_NOW = Date.parse('2026-06-06T12:00:00.000Z');
const minsAgo = (m: number): string => new Date(DEMO_NOW - m * 60_000).toISOString();

function demoHealth(): HealthCheckResult[] {
  // Every demo health card reports "unconfigured" (per the contract) so it is
  // obvious this is not a live probe.
  const status: HealthServiceStatus = 'unconfigured';
  const message = 'Supabase is not configured — demo health check (not a live probe).';
  return [
    {
      ok: false,
      service: 'Supabase',
      status,
      message,
      details: { note: 'demo', statusCode: 0 },
    },
    {
      ok: false,
      service: 'Auth',
      status,
      message,
      details: { note: 'demo', endpoint: '/auth/v1/settings', statusCode: 0 },
    },
    {
      ok: false,
      service: 'REST',
      status,
      message,
      details: { note: 'demo', endpoint: '/rest/v1/', statusCode: 0 },
    },
    {
      ok: false,
      service: 'Storage',
      status,
      message,
      details: { note: 'demo', endpoint: '/storage/v1/', statusCode: 0 },
    },
  ];
}

function demoFailedLogins(): LoginAttemptRecord[] {
  return [
    {
      id: 'demo-login-1',
      event_type: 'login_failure',
      severity: 'warning',
      email: 'attacker@example.com',
      ip_address: '203.0.113.42',
      success: false,
      message: 'Invalid credentials (demo).',
      created_at: minsAgo(12),
    },
    {
      id: 'demo-login-2',
      event_type: 'login_failure',
      severity: 'warning',
      email: 'jdoe@acme.test',
      ip_address: '198.51.100.7',
      success: false,
      message: 'Invalid credentials (demo).',
      created_at: minsAgo(48),
    },
    {
      id: 'demo-login-3',
      event_type: 'login_failure',
      severity: 'error',
      email: 'attacker@example.com',
      ip_address: '203.0.113.42',
      success: false,
      message: 'Rate-limited after repeated failures (demo).',
      created_at: minsAgo(120),
    },
  ];
}

function demoAccessDenials(): AccessDenialRecord[] {
  return [
    {
      id: 'demo-denial-1',
      event_type: 'access_denied',
      severity: 'warning',
      route: '/dashboard/security',
      required_role: 'admin',
      actual_role: 'viewer',
      message: 'Insufficient role (demo).',
      created_at: minsAgo(30),
    },
    {
      id: 'demo-denial-2',
      event_type: 'access_denied',
      severity: 'info',
      route: '/dashboard/publications',
      required_role: 'curator',
      actual_role: 'reviewer',
      message: 'Insufficient role (demo).',
      created_at: minsAgo(95),
    },
  ];
}

function demoSecurityEvents(): SecurityAuditEventRecord[] {
  return [
    {
      id: 'demo-event-1',
      event_type: 'role_change',
      severity: 'critical',
      route: '/dashboard/settings',
      message: 'User role elevated to admin (demo).',
      created_at: minsAgo(20),
    },
    {
      id: 'demo-event-2',
      event_type: 'suspicious_activity',
      severity: 'error',
      route: '/auth/v1/token',
      message: 'Multiple failed logins from a single IP (demo).',
      created_at: minsAgo(60),
    },
    {
      id: 'demo-event-3',
      event_type: 'config_change',
      severity: 'info',
      route: '/dashboard/operations',
      message: 'Scheduler rule updated (demo).',
      created_at: minsAgo(180),
    },
  ];
}

function demoSessionEvents(): SessionEventRecord[] {
  return [
    {
      id: 'demo-session-1',
      event_type: 'session_created',
      severity: 'info',
      ip_address: '192.0.2.10',
      message: 'Sign-in (demo).',
      created_at: minsAgo(15),
    },
    {
      id: 'demo-session-2',
      event_type: 'session_revoked',
      severity: 'warning',
      ip_address: '192.0.2.10',
      message: 'Sign-out / token revoked (demo).',
      created_at: minsAgo(75),
    },
    {
      id: 'demo-session-3',
      event_type: 'session_refreshed',
      severity: 'info',
      ip_address: '192.0.2.10',
      message: 'Token refreshed (demo).',
      created_at: minsAgo(140),
    },
  ];
}

/**
 * A clearly-LABELED demo `SecurityDashboardData`. Used ONLY when an action
 * returns NOT_CONFIGURED. Health cards read "unconfigured"; every record's
 * message says "(demo)". This is the only mock in the security surface.
 */
export function demoSecurityDashboardData(): SecurityDashboardData {
  const failedLogins = demoFailedLogins();
  const accessDenials = demoAccessDenials();
  const securityEvents = demoSecurityEvents();
  return {
    health: demoHealth(),
    failedLogins,
    accessDenials,
    securityEvents,
    sessionEvents: demoSessionEvents(),
    cloudflareWarning:
      'Demo: Cloudflare may challenge Supabase Auth/REST/Storage endpoints in some deployments. See the deployment note below.',
    env: {
      ok: false,
      requiredMissing: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
      optionalMissing: ['OPENAI_API_KEY', 'YOUTUBE_API_KEY', 'PODCAST_INDEX_API_KEY'],
      required: [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', present: false, valid: false },
        { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', present: false, valid: false },
        { key: 'NEXT_PUBLIC_APP_URL', present: true, valid: true },
      ],
      optional: [
        { key: 'SUPABASE_SERVICE_ROLE_KEY', present: true },
        { key: 'OPENAI_API_KEY', present: false },
        { key: 'YOUTUBE_API_KEY', present: false },
        { key: 'PODCAST_INDEX_API_KEY', present: false },
      ],
      warnings: [
        { key: 'NEXT_PUBLIC_SUPABASE_URL', message: 'Demo: NEXT_PUBLIC_SUPABASE_URL is not configured.' },
      ],
    },
    counts: {
      failedLogins24h: failedLogins.length,
      accessDenials24h: accessDenials.length,
      criticalEvents24h: securityEvents.filter((e) => e.severity === 'critical').length,
    },
  };
}
