// =============================================================================
// HSI Phase 62 — Notification engine (SERVER-ONLY). The public API other phases
// call. Resolves the signed-in user + RLS client, enforces the access model in
// code (RLS is the real boundary), respects recipient delivery preferences, and
// composes real platform data for the executive alert summary. NEVER throws.
//
// No external email provider: notifications are stored internally only. Email
// delivery + digesting is a later phase (preferences are captured now).
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { getSourceReliability } from '@/lib/source-reliability';
import * as dal from './persistence';
import type { DbResult } from './persistence';
import {
  type NotificationRecord, type NotificationPreferences, type NotificationStats,
  type NotificationType, type NotificationSeverity, type ExecutiveAlertCategory,
  summarizeNotifications, shouldDeliver, buildExecutiveAlerts, defaultPreferences,
  isValidType, isValidSeverity,
} from './types';

async function ctx(): Promise<{ ok: true; userId: string; isAdmin: boolean; db: ReturnType<typeof createClient> } | { ok: false; error: string; code: 'AUTH_REQUIRED' }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Sign in to view notifications.', code: 'AUTH_REQUIRED' };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  return { ok: true, userId: user.id, isAdmin: hasRole(role ?? undefined, 'admin'), db };
}

export interface CreateInput {
  userId?: string; // recipient; defaults to the actor (self)
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  organizationId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Create a notification. Recipient defaults to the actor; addressing another user
 * requires admin (RLS enforces). Honors the recipient's delivery preferences —
 * a suppressed notification is not stored (returns { suppressed: true }).
 */
export async function createNotification(input: CreateInput): Promise<DbResult<{ id: string | null; suppressed: boolean }>> {
  const c = await ctx();
  if (!c.ok) return c;
  if (!isValidType(input.type)) return { ok: false, error: 'Unknown notification type.', code: 'DB_ERROR' };
  if (input.severity && !isValidSeverity(input.severity)) return { ok: false, error: 'Unknown severity.', code: 'DB_ERROR' };
  if (!input.title?.trim()) return { ok: false, error: 'A title is required.', code: 'DB_ERROR' };

  const recipient = input.userId ?? c.userId;
  if (recipient !== c.userId && !c.isAdmin) {
    return { ok: false, error: 'Only admins may send notifications to other users.', code: 'FORBIDDEN' };
  }

  const prefs = await dal.getPreferencesDal(c.db, recipient);
  const severity = input.severity ?? 'INFO';
  if (!shouldDeliver(prefs, input.type, severity)) {
    return { ok: true, data: { id: null, suppressed: true } };
  }

  const r = await dal.insertNotificationDal(c.db, { ...input, userId: recipient, severity }, c.userId);
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data.id, suppressed: false } };
}

/** The signed-in user's active notifications (most-recent first). */
export async function getNotifications(opts?: dal.ListOptions): Promise<DbResult<NotificationRecord[]>> {
  const c = await ctx();
  if (!c.ok) return c;
  return dal.listNotificationsDal(c.db, c.userId, opts);
}

/** The signed-in user's unread count. */
export async function getUnreadCount(): Promise<number> {
  const c = await ctx();
  if (!c.ok) return 0;
  return dal.unreadCountDal(c.db, c.userId);
}

/**
 * Stats. `self` (default) = the user's own stream; `platform` = cross-user
 * (admins only — falls back to self for non-admins, never leaking).
 */
export async function getNotificationStats(scope: 'self' | 'platform' = 'self'): Promise<NotificationStats> {
  const c = await ctx();
  if (!c.ok) return summarizeNotifications([]);
  const res = scope === 'platform' && c.isAdmin
    ? await dal.listAllNotificationsDal(c.db, { includeArchived: true, limit: 2000 })
    : await dal.listNotificationsDal(c.db, c.userId, { includeArchived: true, limit: 1000 });
  return summarizeNotifications(res.ok ? res.data : []);
}

export async function markRead(id: string): Promise<DbResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  return dal.markReadDal(c.db, id, c.userId);
}

export async function markAllRead(): Promise<DbResult<{ updated: number }>> {
  const c = await ctx();
  if (!c.ok) return c;
  return dal.markAllReadDal(c.db, c.userId);
}

export async function archiveNotification(id: string): Promise<DbResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;
  return dal.archiveDal(c.db, id, c.userId);
}

export async function getPreferences(): Promise<NotificationPreferences> {
  const c = await ctx();
  if (!c.ok) return defaultPreferences();
  return dal.getPreferencesDal(c.db, c.userId);
}

export async function updatePreferences(prefs: NotificationPreferences): Promise<DbResult<{ ok: true }>> {
  const c = await ctx();
  if (!c.ok) return c;
  return dal.upsertPreferencesDal(c.db, c.userId, prefs);
}

export interface ExecutiveAlertSummary {
  categories: ExecutiveAlertCategory[];
  totalActive: number;
  criticalActive: number;
}

/**
 * Admin executive alert summary — platform-wide stats + live cross-checks
 * (failing sources from Phase 61; pending submissions backlog). All computed.
 * Non-admins get an empty summary (no cross-user data).
 */
export async function getExecutiveAlerts(): Promise<ExecutiveAlertSummary> {
  const c = await ctx();
  const empty: ExecutiveAlertSummary = { categories: buildExecutiveAlerts(summarizeNotifications([])), totalActive: 0, criticalActive: 0 };
  if (!c.ok || !c.isAdmin) return empty;

  const listed = await dal.listAllNotificationsDal(c.db, { includeArchived: false, limit: 2000 });
  const stats = summarizeNotifications(listed.ok ? listed.data : []);

  // Live cross-checks (real data; degrade to 0 on any failure).
  let sourceFailuresLive = 0;
  try {
    const sr = await getSourceReliability();
    sourceFailuresLive = sr.breakdown.failed + sr.breakdown.blocked;
  } catch { /* ignore */ }
  let reviewBacklogLive = 0;
  try {
    const { count } = await c.db.from('signal_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    reviewBacklogLive = count ?? 0;
  } catch { /* ignore */ }

  return {
    categories: buildExecutiveAlerts(stats, { sourceFailuresLive, reviewBacklogLive }),
    totalActive: stats.total,
    criticalActive: stats.bySeverity.CRITICAL,
  };
}
