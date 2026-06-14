// =============================================================================
// HSI Phase 24B — IAM testers DAL. SERVER-ONLY. Admin-only. READ-ONLY metrics.
//
// Beta-tester management view: name/email/role/team/last-login plus activity
// (signals created, reviews completed, reports submitted) and a readiness flag.
// Read-only — no gamification, no writes.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { adminFail, getServiceClient, notConfigured, requireAdmin, supabaseConfigured, type DbResult } from './guard';
import { highestRole } from '@/lib/auth/get-session-role';
import type { AdminTestersData, AdminTesterRow, UserStatus } from '@hsi/shared-types';

type JsonRecord = Record<string, unknown>;
async function rows(db: SupabaseClient, table: string, build: (q: ReturnType<SupabaseClient['from']>) => unknown): Promise<JsonRecord[]> {
  try {
    const { data, error } = (await build(db.from(table))) as { data: JsonRecord[] | null; error: unknown };
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
function countBy(list: JsonRecord[], key: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of list) {
    const k = String(r[key] ?? '');
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export async function listTesters(): Promise<DbResult<AdminTestersData>> {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate;
    if (!supabaseConfigured()) return notConfigured();
    const { db } = gate.ctx;

    const [users, userRoles, teams, teamMembers, signals, reviews, publications] = await Promise.all([
      rows(db, 'users', (q) => q.select('id, email, name, status, created_at').limit(2000)),
      rows(db, 'user_roles', (q) => q.select('user_id, roles(name)').limit(10000)),
      rows(db, 'teams', (q) => q.select('id, key, name').limit(50)),
      rows(db, 'team_members', (q) => q.select('team_id, user_id').limit(10000)),
      rows(db, 'hsin_signals', (q) => q.select('created_by').limit(20000)),
      rows(db, 'review_decisions', (q) => q.select('reviewer_id').limit(20000)),
      rows(db, 'hsin_publications', (q) => q.select('created_by').limit(20000)),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const ur of userRoles) {
      const uid = String(ur.user_id ?? '');
      const rel = ur.roles as { name?: unknown } | { name?: unknown }[] | null;
      const name = Array.isArray(rel) ? (rel[0] as { name?: unknown })?.name : rel?.name;
      if (uid && typeof name === 'string') rolesByUser.set(uid, [...(rolesByUser.get(uid) ?? []), name.toLowerCase()]);
    }
    const teamNameById = new Map<string, string>();
    for (const t of teams) teamNameById.set(String(t.id ?? ''), String(t.name ?? t.key ?? ''));
    const teamByUser = new Map<string, string>();
    for (const m of teamMembers) { const uid = String(m.user_id ?? ''); if (uid && !teamByUser.has(uid)) teamByUser.set(uid, teamNameById.get(String(m.team_id ?? '')) ?? ''); }

    const sig = countBy(signals, 'created_by');
    const rev = countBy(reviews, 'reviewer_id');
    const pub = countBy(publications, 'created_by');

    const logins = new Map<string, string | null>();
    const svc = await getServiceClient();
    if (svc) {
      try {
        const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
        for (const u of data?.users ?? []) logins.set(u.id, (u.last_sign_in_at as string | undefined) ?? null);
      } catch { /* best-effort */ }
    }

    const testers: AdminTesterRow[] = users.map((u) => {
      const id = String(u.id ?? '');
      const r = rolesByUser.get(id) ?? [];
      const status = (['pending', 'active', 'suspended', 'disabled'].includes(String(u.status)) ? String(u.status) : 'active') as UserStatus;
      const lastLoginAt = logins.get(id) ?? null;
      const signalsCreated = sig.get(id) ?? 0;
      const reviewsCompleted = rev.get(id) ?? 0;
      const reportsSubmitted = pub.get(id) ?? 0;
      // "Ready" = active, has a role above viewer, and has signed in at least once.
      const role = highestRole(r);
      const ready = status === 'active' && role !== null && role !== 'viewer' && lastLoginAt !== null;
      return { id, name: u.name ? String(u.name) : null, email: String(u.email ?? ''), role, team: teamByUser.get(id) ?? null, status, lastLoginAt, signalsCreated, reviewsCompleted, reportsSubmitted, ready };
    });

    return { ok: true, data: { testers } };
  } catch (e) {
    return adminFail(e);
  }
}
