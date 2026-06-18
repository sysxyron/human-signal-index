// =============================================================================
// HSI Phase 62 — Notifications & Alerting: shared types + PURE helpers (no I/O).
//
// The notification vocabulary (types/severities), per-user preferences, the
// delivery-gating rule, lifecycle transitions, stat aggregation, the access
// (RBAC) model mirrored in code, and the executive-alert mapper. Everything here
// is pure → unit-testable without a database. PURE: no imports, no clocks.
// =============================================================================

// ---- vocabulary -------------------------------------------------------------

export const NOTIFICATION_TYPES = [
  'SOURCE_FAILURE', 'SOURCE_RECOVERED', 'SIGNAL_SUBMITTED', 'SIGNAL_ESCALATED',
  'REVIEW_REQUIRED', 'REVIEW_APPROVED', 'REVIEW_REJECTED', 'PUBLICATION_PUBLISHED',
  'CORRECTION_RECEIVED', 'WATCHLIST_MATCH', 'FORECAST_TRIGGER', 'SYSTEM_ALERT',
  'SECURITY_EVENT', 'BETA_FEEDBACK',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SEVERITIES = ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const;
export type NotificationSeverity = (typeof SEVERITIES)[number];

export const DIGEST_FREQUENCIES = ['realtime', 'hourly', 'daily', 'weekly', 'off'] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export function isValidType(v: unknown): v is NotificationType {
  return typeof v === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}
export function isValidSeverity(v: unknown): v is NotificationSeverity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
}
export function isValidDigest(v: unknown): v is DigestFrequency {
  return typeof v === 'string' && (DIGEST_FREQUENCIES as readonly string[]).includes(v);
}

/** Ordered rank for comparison/sorting (INFO < NOTICE < WARNING < CRITICAL). */
export function severityRank(sev: NotificationSeverity): number {
  return SEVERITIES.indexOf(sev);
}

// ---- records ----------------------------------------------------------------

export interface NotificationRecord {
  id: string;
  userId: string;
  organizationId: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  createdLabel: string;
}

// ---- preferences ------------------------------------------------------------

export type CategoryPreferenceKey =
  | 'source_alerts' | 'review_alerts' | 'publication_alerts' | 'forecast_alerts' | 'system_alerts';

export interface NotificationPreferences {
  emailEnabled: boolean;
  inAppEnabled: boolean;
  criticalOnly: boolean;
  digestFrequency: DigestFrequency;
  sourceAlerts: boolean;
  reviewAlerts: boolean;
  publicationAlerts: boolean;
  forecastAlerts: boolean;
  systemAlerts: boolean;
}

export function defaultPreferences(): NotificationPreferences {
  return {
    emailEnabled: true,
    inAppEnabled: true,
    criticalOnly: false,
    digestFrequency: 'daily',
    sourceAlerts: true,
    reviewAlerts: true,
    publicationAlerts: true,
    forecastAlerts: true,
    systemAlerts: true,
  };
}

/** Which category toggle governs a notification type. */
export function prefKeyForType(type: NotificationType): CategoryPreferenceKey {
  switch (type) {
    case 'SOURCE_FAILURE':
    case 'SOURCE_RECOVERED':
      return 'source_alerts';
    case 'SIGNAL_SUBMITTED':
    case 'SIGNAL_ESCALATED':
    case 'REVIEW_REQUIRED':
    case 'REVIEW_APPROVED':
    case 'REVIEW_REJECTED':
      return 'review_alerts';
    case 'PUBLICATION_PUBLISHED':
    case 'CORRECTION_RECEIVED':
      return 'publication_alerts';
    case 'WATCHLIST_MATCH':
    case 'FORECAST_TRIGGER':
      return 'forecast_alerts';
    case 'SYSTEM_ALERT':
    case 'SECURITY_EVENT':
    case 'BETA_FEEDBACK':
      return 'system_alerts';
  }
}

function categoryEnabled(prefs: NotificationPreferences, key: CategoryPreferenceKey): boolean {
  switch (key) {
    case 'source_alerts': return prefs.sourceAlerts;
    case 'review_alerts': return prefs.reviewAlerts;
    case 'publication_alerts': return prefs.publicationAlerts;
    case 'forecast_alerts': return prefs.forecastAlerts;
    case 'system_alerts': return prefs.systemAlerts;
  }
}

/**
 * In-app delivery decision for a recipient. SECURITY_EVENT is never suppressed
 * (operators must always see security notices). Otherwise: in-app must be on,
 * critical-only honored, and the type's category toggle respected.
 */
export function shouldDeliver(prefs: NotificationPreferences, type: NotificationType, severity: NotificationSeverity): boolean {
  if (type === 'SECURITY_EVENT') return true;
  if (!prefs.inAppEnabled) return false;
  if (prefs.criticalOnly && severity !== 'CRITICAL') return false;
  return categoryEnabled(prefs, prefKeyForType(type));
}

// ---- lifecycle (pure transitions; caller supplies the clock) ---------------

export interface LifecyclePatch { read_at?: string | null; archived_at?: string | null; updated_at: string }

export function markReadPatch(nowIso: string): LifecyclePatch { return { read_at: nowIso, updated_at: nowIso }; }
export function markUnreadPatch(nowIso: string): LifecyclePatch { return { read_at: null, updated_at: nowIso }; }
export function archivePatch(nowIso: string): LifecyclePatch { return { archived_at: nowIso, updated_at: nowIso }; }

export function isUnread(n: Pick<NotificationRecord, 'readAt' | 'archivedAt'>): boolean {
  return n.readAt == null && n.archivedAt == null;
}
export function isArchived(n: Pick<NotificationRecord, 'archivedAt'>): boolean {
  return n.archivedAt != null;
}
export function isActive(n: Pick<NotificationRecord, 'archivedAt'>): boolean {
  return n.archivedAt == null;
}

// ---- access model (mirrors the RLS policies, in code, for tests) ------------

export interface AccessContext { userId: string | null; isAdmin: boolean }

/** A signed-in owner sees their own notifications; admins see all. */
export function canViewNotification(ctx: AccessContext, n: Pick<NotificationRecord, 'userId'>): boolean {
  if (ctx.isAdmin) return true;
  return ctx.userId != null && ctx.userId === n.userId;
}
/** Only the owner or an admin may mark-read / archive a notification. */
export function canMutateNotification(ctx: AccessContext, n: Pick<NotificationRecord, 'userId'>): boolean {
  return canViewNotification(ctx, n);
}
/** Only admins may view the platform-wide (cross-user) alert stream. */
export function canViewAllNotifications(ctx: AccessContext): boolean {
  return ctx.isAdmin;
}

// ---- stats (pure aggregation over a record set) ----------------------------

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
  archived: number;
  bySeverity: Record<NotificationSeverity, number>;
  byType: Record<NotificationType, number>;
}

export function emptyStats(): NotificationStats {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<NotificationSeverity, number>;
  const byType = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, 0])) as Record<NotificationType, number>;
  return { total: 0, unread: 0, read: 0, archived: 0, bySeverity, byType };
}

/** Aggregate a record set. Active (non-archived) rows drive total/unread/read +
 *  the severity/type breakdowns; archived rows are counted separately. */
export function summarizeNotifications(records: NotificationRecord[]): NotificationStats {
  const stats = emptyStats();
  for (const n of records) {
    if (isArchived(n)) { stats.archived += 1; continue; }
    stats.total += 1;
    if (n.readAt == null) stats.unread += 1; else stats.read += 1;
    stats.bySeverity[n.severity] += 1;
    stats.byType[n.type] += 1;
  }
  return stats;
}

// ---- executive alert summary (pure mapper over stats) ----------------------

export interface ExecutiveAlertCategory {
  key: string;
  label: string;
  count: number;
  tone: NotificationSeverity; // display tone; INFO when count is 0
  detail: string;
}

export interface ExecutiveExtras {
  /** Live source failures from the Phase 61 source-reliability layer. */
  sourceFailuresLive?: number;
  /** Live review backlog (e.g. pending submissions). */
  reviewBacklogLive?: number;
}

function tone(count: number, active: NotificationSeverity): NotificationSeverity {
  return count > 0 ? active : 'INFO';
}

/**
 * Build the six executive categories from computed stats (+ optional live
 * cross-checks). Every number is a real computed count — no fabricated readiness
 * indicators. A category at 0 simply reports 0.
 */
export function buildExecutiveAlerts(stats: NotificationStats, extras: ExecutiveExtras = {}): ExecutiveAlertCategory[] {
  const t = stats.byType;
  const critical = stats.bySeverity.CRITICAL;
  const reviewBottlenecks = t.REVIEW_REQUIRED + t.SIGNAL_ESCALATED + (extras.reviewBacklogLive ?? 0);
  const sourceFailures = t.SOURCE_FAILURE + (extras.sourceFailuresLive ?? 0);
  const publicationDelays = t.CORRECTION_RECEIVED + t.PUBLICATION_PUBLISHED;
  const forecastTriggers = t.FORECAST_TRIGGER + t.WATCHLIST_MATCH;
  const trustAnomalies = t.SECURITY_EVENT + t.SYSTEM_ALERT;

  return [
    { key: 'critical', label: 'Critical alerts', count: critical, tone: tone(critical, 'CRITICAL'), detail: 'Active notifications at CRITICAL severity.' },
    { key: 'review', label: 'Review bottlenecks', count: reviewBottlenecks, tone: tone(reviewBottlenecks, 'WARNING'), detail: 'Reviews required / escalations + pending submissions.' },
    { key: 'source', label: 'Source failures', count: sourceFailures, tone: tone(sourceFailures, 'WARNING'), detail: 'Source-failure alerts + live failing sources.' },
    { key: 'publication', label: 'Publication alerts', count: publicationDelays, tone: tone(publicationDelays, 'NOTICE'), detail: 'Publications + corrections received.' },
    { key: 'forecast', label: 'Forecast triggers', count: forecastTriggers, tone: tone(forecastTriggers, 'NOTICE'), detail: 'Forecast triggers + watchlist matches.' },
    { key: 'trust', label: 'Trust & security anomalies', count: trustAnomalies, tone: tone(trustAnomalies, 'WARNING'), detail: 'Security events + system alerts.' },
  ];
}
