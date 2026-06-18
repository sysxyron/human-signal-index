// =============================================================================
// HSI Phase 62 — Notifications DAL (SERVER-ONLY).
//
// All access goes through the caller's cookie-backed RLS client (createClient) —
// NEVER the service-role client — so owner-scoping + admin visibility are enforced
// by the database policies (no cross-user leakage). Every function is env-tolerant
// and NEVER throws: it degrades to empty/zero/default. Row → camelCase mapping is
// done here; pure aggregation/gating lives in ./types.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type NotificationRecord, type NotificationPreferences, type NotificationType,
  type NotificationSeverity, defaultPreferences, isValidType, isValidSeverity,
} from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

interface Row {
  id: string; user_id: string; organization_id: string | null; type: string; severity: string;
  title: string | null; body: string | null; link: string | null; entity_type: string | null;
  entity_id: string | null; metadata: Record<string, unknown> | null; read_at: string | null;
  archived_at: string | null; created_by: string | null; created_at: string;
}

function mapRow(r: Row): NotificationRecord {
  return {
    id: r.id,
    userId: r.user_id,
    organizationId: r.organization_id,
    type: (isValidType(r.type) ? r.type : 'SYSTEM_ALERT') as NotificationType,
    severity: (isValidSeverity(r.severity) ? r.severity : 'INFO') as NotificationSeverity,
    title: r.title ?? '(untitled)',
    body: r.body,
    link: r.link,
    entityType: r.entity_type,
    entityId: r.entity_id,
    metadata: r.metadata ?? {},
    readAt: r.read_at,
    archivedAt: r.archived_at,
    createdBy: r.created_by,
    createdAt: r.created_at,
    createdLabel: fmtDate(r.created_at),
  };
}

const SELECT = 'id, user_id, organization_id, type, severity, title, body, link, entity_type, entity_id, metadata, read_at, archived_at, created_by, created_at';

function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}

export interface CreateNotificationInput {
  userId: string;
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

/** Insert a notification (RLS: actor must be the recipient or an admin). */
export async function insertNotificationDal(db: SupabaseClient, input: CreateNotificationInput, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('notifications').insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      type: input.type,
      severity: input.severity ?? 'INFO',
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
      created_by: actorId,
    }).select('id').single();
    if (error) return fail(error);
    const id = (data as { id: string }).id;
    await logEventDal(db, id, 'created', actorId, 'in_app');
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

/** Append an audit/delivery event (best-effort; never blocks the caller). */
export async function logEventDal(db: SupabaseClient, notificationId: string, event: string, actorId: string | null, channel?: string, note?: string): Promise<void> {
  try {
    await db.from('notification_events').insert({ notification_id: notificationId, event, actor_id: actorId, channel: channel ?? null, note: note ?? null });
  } catch { /* best-effort */ }
}

export interface ListOptions { includeArchived?: boolean; limit?: number }

/** List the signed-in user's notifications (RLS-scoped; admin sees own here —
 *  platform-wide reads use listAllNotificationsDal). Active rows by default. */
export async function listNotificationsDal(db: SupabaseClient, userId: string, opts: ListOptions = {}): Promise<DbResult<NotificationRecord[]>> {
  try {
    let q = db.from('notifications').select(SELECT).eq('user_id', userId);
    if (!opts.includeArchived) q = q.is('archived_at', null);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 200);
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as Row[]).map(mapRow) };
  } catch (e) { return fail(e); }
}

/** Platform-wide notifications for admin monitoring (RLS allows admin select). */
export async function listAllNotificationsDal(db: SupabaseClient, opts: ListOptions = {}): Promise<DbResult<NotificationRecord[]>> {
  try {
    let q = db.from('notifications').select(SELECT);
    if (!opts.includeArchived) q = q.is('archived_at', null);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(opts.limit ?? 1000);
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as Row[]).map(mapRow) };
  } catch (e) { return fail(e); }
}

/** Unread (active, read_at null) count for a user. Computed via head count. */
export async function unreadCountDal(db: SupabaseClient, userId: string): Promise<number> {
  try {
    const { count } = await db.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).is('read_at', null).is('archived_at', null);
    return count ?? 0;
  } catch { return 0; }
}

export async function markReadDal(db: SupabaseClient, id: string, userId: string): Promise<DbResult<{ id: string }>> {
  try {
    const now = new Date().toISOString();
    const { error } = await db.from('notifications').update({ read_at: now, updated_at: now }).eq('id', id);
    if (error) return fail(error);
    await logEventDal(db, id, 'read', userId);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function markAllReadDal(db: SupabaseClient, userId: string): Promise<DbResult<{ updated: number }>> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await db.from('notifications').update({ read_at: now, updated_at: now })
      .eq('user_id', userId).is('read_at', null).is('archived_at', null).select('id');
    if (error) return fail(error);
    return { ok: true, data: { updated: (data ?? []).length } };
  } catch (e) { return fail(e); }
}

export async function archiveDal(db: SupabaseClient, id: string, userId: string): Promise<DbResult<{ id: string }>> {
  try {
    const now = new Date().toISOString();
    const { error } = await db.from('notifications').update({ archived_at: now, updated_at: now }).eq('id', id);
    if (error) return fail(error);
    await logEventDal(db, id, 'archived', userId);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

// ---- preferences ------------------------------------------------------------

interface PrefRow {
  email_enabled: boolean; in_app_enabled: boolean; critical_only: boolean; digest_frequency: string;
  source_alerts: boolean; review_alerts: boolean; publication_alerts: boolean; forecast_alerts: boolean; system_alerts: boolean;
}

function mapPrefs(r: PrefRow): NotificationPreferences {
  const d = defaultPreferences();
  return {
    emailEnabled: r.email_enabled ?? d.emailEnabled,
    inAppEnabled: r.in_app_enabled ?? d.inAppEnabled,
    criticalOnly: r.critical_only ?? d.criticalOnly,
    digestFrequency: (['realtime', 'hourly', 'daily', 'weekly', 'off'].includes(r.digest_frequency) ? r.digest_frequency : d.digestFrequency) as NotificationPreferences['digestFrequency'],
    sourceAlerts: r.source_alerts ?? d.sourceAlerts,
    reviewAlerts: r.review_alerts ?? d.reviewAlerts,
    publicationAlerts: r.publication_alerts ?? d.publicationAlerts,
    forecastAlerts: r.forecast_alerts ?? d.forecastAlerts,
    systemAlerts: r.system_alerts ?? d.systemAlerts,
  };
}

/** Read a user's preferences, falling back to defaults when no row exists. */
export async function getPreferencesDal(db: SupabaseClient, userId: string): Promise<NotificationPreferences> {
  try {
    const { data } = await db.from('notification_preferences')
      .select('email_enabled, in_app_enabled, critical_only, digest_frequency, source_alerts, review_alerts, publication_alerts, forecast_alerts, system_alerts')
      .eq('user_id', userId).maybeSingle();
    if (!data) return defaultPreferences();
    return mapPrefs(data as PrefRow);
  } catch { return defaultPreferences(); }
}

/** Upsert a user's preferences (RLS: owner only). */
export async function upsertPreferencesDal(db: SupabaseClient, userId: string, prefs: NotificationPreferences): Promise<DbResult<{ ok: true }>> {
  try {
    const { error } = await db.from('notification_preferences').upsert({
      user_id: userId,
      email_enabled: prefs.emailEnabled,
      in_app_enabled: prefs.inAppEnabled,
      critical_only: prefs.criticalOnly,
      digest_frequency: prefs.digestFrequency,
      source_alerts: prefs.sourceAlerts,
      review_alerts: prefs.reviewAlerts,
      publication_alerts: prefs.publicationAlerts,
      forecast_alerts: prefs.forecastAlerts,
      system_alerts: prefs.systemAlerts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return fail(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return fail(e); }
}
