// =============================================================================
// HSI — app-identity sync: ensure a public.users row exists for the signed-in
// auth user (SERVER-ONLY).
//
// The whole RLS/FK model assumes `public.users.id == auth.uid()` (migration
// 0006's on_auth_user_created trigger mirrors auth.users → public.users). If that
// row is ever missing (trigger not installed when the account was created, an
// account provisioned out-of-band, a partially-applied migration, etc.) then any
// insert whose FK targets public.users(id) fails:
//   * role_applications.user_id  → role_applications_user_id_fkey
//   * signal_submissions.submitter_id → signal_submissions_submitter_id_fkey
//
// `ensureCurrentAppUser()` repairs this just-in-time before a protected write:
// it reads the current user server-side, checks public.users, and inserts a safe
// default row (same id) when missing. public.users has NO self-insert RLS policy
// (only admin insert + self read), so the WRITE path uses the server-only
// service-role client. It is NEVER run client-side and the service key is never
// exposed to the browser. No FK is removed; no RLS is weakened.
//
// The pure core (`ensureAppUserRow`) takes an injected client so it is fully
// unit-testable without next/headers or a live database.
// =============================================================================

import { getUser, createClient } from '@/lib/supabase/server';
import { getServiceClient } from '@/lib/admin/guard';
import { logError } from '@/lib/errors/format-error';

/** Shown to the user when their identity row can't be confirmed/created. NEVER
 *  surface the raw FK / Postgres error to the user. */
export const ACCOUNT_NOT_READY_MESSAGE =
  'Your account setup is still being prepared. Please refresh and try again.';

export interface EnsureAppUserResult {
  ok: boolean;
  /** The confirmed public.users.id (== auth.uid()) when ok. */
  id?: string;
  /** True when this call inserted the row (vs. it already existing). */
  created?: boolean;
  /** Operator-facing, NON-secret reason when not ok (safe to log). */
  reason?: string;
}

/** The minimal Supabase surface the core needs — keeps it mockable. */
export interface MinimalAuthUser {
  id: string;
  email?: string | null;
}
interface SelectChain {
  eq(column: string, value: string): { maybeSingle(): Promise<{ data: { id?: string } | null; error: unknown }> };
}
interface InsertResult {
  error: unknown;
}
export interface MinimalIdentityClient {
  from(table: string): {
    select(columns: string): SelectChain;
    insert(row: Record<string, unknown>): Promise<InsertResult> | { then: PromiseLike<InsertResult>['then'] };
  };
}

/** Postgres foreign-key violation (23503) or a message naming the identity FKs. */
export function isMissingIdentityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code === '23503') return true;
  const text = `${typeof e.message === 'string' ? e.message : ''} ${typeof e.details === 'string' ? e.details : ''}`;
  return /role_applications_user_id_fkey|signal_submissions_submitter_id_fkey|public\.users|violates foreign key/i.test(text);
}

/** Local-part of an email, mirroring the handle_new_user() trigger's name rule. */
export function deriveNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim();
  return local && local.length > 0 ? local : 'Member';
}

/** A non-null, unique-per-user email when auth carries none (e.g. phone-only).
 *  public.users.email is NOT NULL UNIQUE, so a safe default row still needs one. */
export function fallbackEmail(userId: string, email?: string | null): string {
  const trimmed = (email ?? '').trim();
  if (trimmed.length > 0) return trimmed;
  return `${userId}@no-email.users.local`;
}

async function fetchExistingId(db: MinimalIdentityClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await db.from('users').select('id').eq('id', userId).maybeSingle();
    if (error) return null;
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

/**
 * Pure-ish core: ensure a public.users row exists for `user` using the injected
 * `db` (a service-role client for the insert path). Never throws. Idempotent and
 * race-safe — if the insert conflicts with a concurrently-created row (e.g. the
 * auth trigger firing), it re-checks and treats the existing row as success.
 */
export async function ensureAppUserRow(db: MinimalIdentityClient, user: MinimalAuthUser): Promise<EnsureAppUserResult> {
  if (!user?.id) return { ok: false, reason: 'no authenticated user id' };

  const existing = await fetchExistingId(db, user.id);
  if (existing) return { ok: true, id: existing, created: false };

  // Missing — insert a safe default row with the SAME id as auth.users.
  const email = fallbackEmail(user.id, user.email);
  let insertError: unknown = null;
  try {
    const res = await db.from('users').insert({ id: user.id, email, name: deriveNameFromEmail(email) });
    insertError = (res as InsertResult)?.error ?? null;
  } catch (e) {
    insertError = e;
  }

  if (!insertError) return { ok: true, id: user.id, created: true };

  // Insert failed — a concurrent trigger/insert may have created it. Re-check.
  const afterConflict = await fetchExistingId(db, user.id);
  if (afterConflict) return { ok: true, id: afterConflict, created: false };

  return { ok: false, reason: 'public.users row missing and could not be created' };
}

/**
 * Ensure the CURRENT request's authenticated user has a public.users row, using
 * the service-role client for the (RLS-blocked) insert. Returns the confirmed
 * public.users.id. Call before any insert whose FK targets public.users(id).
 *
 * Degrades safely: with no service-role key, it can still confirm an existing row
 * via the per-request RLS client (self-read), but cannot create a missing one —
 * in which case it returns { ok:false } and the caller shows ACCOUNT_NOT_READY.
 */
export async function ensureCurrentAppUser(): Promise<EnsureAppUserResult> {
  const user = await getUser();
  if (!user) return { ok: false, reason: 'no authenticated user' };

  const service = await getServiceClient();
  // Service-role client creates the row when missing; without it, the RLS client
  // can still SELECT the user's own row (so existing users keep working).
  const db = (service ?? createClient()) as unknown as MinimalIdentityClient;

  const result = await ensureAppUserRow(db, { id: user.id, email: user.email });

  if (!result.ok) {
    // Operator-facing, non-secret reason only — never tokens or raw FK errors.
    logError('auth/ensure-app-user', `identity sync failed for user ${user.id}: ${result.reason ?? 'unknown'}${service ? '' : ' (no service-role key configured)'}`);
  }
  return result;
}
