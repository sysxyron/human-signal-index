// =============================================================================
// HSI Phase 24B — IAM access logs DAL. SERVER-ONLY. Admin-only. READ-ONLY.
//
// Reads public.security_audit_events (the existing Phase-14/18 audit trail) for
// the admin access-logs console, with filters by user, action, and date.
// =============================================================================

import { adminFail, notConfigured, requireAdmin, supabaseConfigured, type DbResult } from './guard';
import type { AdminAccessLogsData, AdminAccessLogRow } from '@hsi/shared-types';

export interface AccessLogFilters {
  userId?: string;
  eventType?: string;
  from?: string;
  to?: string;
}

export async function listAccessLogs(filters: AccessLogFilters = {}): Promise<DbResult<AdminAccessLogsData>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;

    let q = db.from('security_audit_events').select('id, user_id, event_type, severity, route, message, created_at').order('created_at', { ascending: false }).limit(500);
    if (filters.userId) q = q.eq('user_id', filters.userId);
    if (filters.eventType) q = q.eq('event_type', filters.eventType);
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) q = q.lte('created_at', filters.to);
    const { data, error } = await q;
    if (error) return adminFail(error);

    // Resolve emails for the listed user_ids (best-effort).
    const ids = Array.from(new Set((data ?? []).map((e) => (e as { user_id?: string }).user_id).filter(Boolean) as string[]));
    const emailById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: users } = await db.from('users').select('id, email').in('id', ids);
      for (const u of users ?? []) emailById.set(String((u as { id?: string }).id ?? ''), String((u as { email?: string }).email ?? ''));
    }

    const events: AdminAccessLogRow[] = (data ?? []).map((e) => {
      const r = e as Record<string, unknown>;
      const uid = r.user_id ? String(r.user_id) : null;
      return {
        id: String(r.id ?? ''), userId: uid, email: uid ? emailById.get(uid) ?? null : null,
        eventType: r.event_type ? String(r.event_type) : null, severity: r.severity ? String(r.severity) : null,
        route: r.route ? String(r.route) : null, message: r.message ? String(r.message) : null,
        createdAt: String(r.created_at ?? ''),
      };
    });
    const eventTypes = Array.from(new Set(events.map((e) => e.eventType).filter(Boolean) as string[])).sort();
    return { ok: true, data: { events, eventTypes } };
  } catch (e) {
    return adminFail(e);
  }
}
