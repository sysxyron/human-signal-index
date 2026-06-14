// =============================================================================
// HSI Phase 24B — IAM admin guard + service-role + audit helpers. SERVER-ONLY.
//
// Every IAM operation is ADMIN-ONLY (verified via the canonical role resolver) and
// AUDITED to public.security_audit_events. The service-role client is used ONLY
// here, server-side, for auth.admin invitations — it is NEVER imported into client
// code and the key is never exposed.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED = 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';
const SERVICE_REQUIRED = 'Inviting users requires the service-role key (SUPABASE_SERVICE_ROLE_KEY) on the server.';

export function adminFail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('admin/iam', error);
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}
export function notConfigured(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
}
export function serviceRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: SERVICE_REQUIRED, code: 'NOT_CONFIGURED' };
}

export function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}
export function serviceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0);
}

export interface AdminContext {
  user: User;
  db: SupabaseClient; // RLS admin client (admin policies apply)
}

/** Gate an IAM operation to admins. Returns the admin context or a DbResult error. */
export async function requireAdmin(): Promise<{ ok: true; ctx: AdminContext } | { ok: false; error: string; code: DbResultCode }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };
  const db = createClient();
  const role = await loadHighestRole(db, user.id);
  if (!hasRole(role ?? undefined, 'admin')) {
    return { ok: false, error: 'Identity & Access Management is restricted to administrators.', code: 'FORBIDDEN' };
  }
  return { ok: true, ctx: { user, db } };
}

/** The service-role client (server-only) for auth.admin operations, or null. */
export async function getServiceClient(): Promise<SupabaseClient | null> {
  if (!serviceRoleConfigured()) return null;
  try {
    const { createServiceRoleClient } = await import('@hsi/database');
    return createServiceRoleClient() as unknown as SupabaseClient;
  } catch {
    return null;
  }
}

/** Write a security audit event. Best-effort — never blocks the operation. */
export async function recordSecurityAudit(
  db: SupabaseClient,
  input: { actorId: string; eventType: string; message: string; metadata?: Record<string, unknown>; severity?: 'info' | 'warning' | 'error' | 'critical' },
): Promise<void> {
  try {
    await db.from('security_audit_events').insert({
      user_id: input.actorId,
      event_type: input.eventType,
      severity: input.severity ?? 'info',
      route: '/dashboard/admin',
      message: input.message,
      metadata: input.metadata ?? {},
    });
  } catch {
    // best-effort.
  }
}
