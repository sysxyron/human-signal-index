// =============================================================================
// HSI Phase 23 — Launch Operations data-access layer. SERVER-ONLY. ADMIN-ONLY.
//
// Assembles the production-readiness picture from real signals — env validation,
// Supabase/auth/storage health probes, migration audit (best-effort), the
// canonical RBAC role, and the tester count — and runs the PURE readiness engine.
//
// NEVER throws; empty env → NOT_CONFIGURED → the page renders a labeled demo.
// Read-only: this DAL performs no writes and changes no governance.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { validateStartupEnv } from '@/lib/env/validate-env';
import { probeSupabase, probeAuth, probeStorage } from '@/lib/health/probes';
import { auditMigrations } from './migration-audit';
import { computeReadiness, type ReadinessInput } from './readiness';
import type { LaunchHealthLine, LaunchStatus } from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED = 'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('launch/persistence', error);
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}

function serviceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0);
}

function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.trim().length > 0 && key.trim().length > 0 && !/127\.0\.0\.1:54321|anon-placeholder/.test(`${url}${key}`);
}

/** Best-effort: read applied migration versions from supabase_migrations. */
async function loadAppliedMigrations(client: SupabaseClient): Promise<string[] | null> {
  try {
    // The migration ledger lives in the supabase_migrations schema; it is usually
    // not exposed via PostgREST, so this is best-effort. null → unverifiable.
    const q = (client as unknown as { schema: (s: string) => SupabaseClient }).schema('supabase_migrations');
    const { data, error } = await q.from('schema_migrations').select('version').limit(1000);
    if (error || !Array.isArray(data)) return null;
    return (data as Array<{ version?: unknown }>)
      .map((r) => (typeof r.version === 'string' ? r.version : String(r.version ?? '')))
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** Best-effort: count distinct users with an assigned role (admin RLS). */
async function loadTesterCount(client: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await client.from('user_roles').select('user_id').limit(10000);
    if (error || !Array.isArray(data)) return null;
    const ids = new Set((data as Array<{ user_id?: unknown }>).map((r) => String(r.user_id ?? '')).filter(Boolean));
    return ids.size;
  } catch {
    return null;
  }
}

async function probeLine(fn: () => Promise<{ ok: boolean; service: string; status: string; message: string }>): Promise<LaunchHealthLine | null> {
  try {
    const r = await fn();
    return { service: r.service, ok: r.ok, status: r.status, message: r.message };
  } catch {
    return null;
  }
}

/**
 * Assemble the Launch Operations Center payload. ADMIN-ONLY. Offline-safe:
 * returns NOT_CONFIGURED when Supabase env is absent so the page shows a labeled
 * demo rather than erroring.
 */
export async function getLaunchStatus(opts?: { now?: string }): Promise<DbResult<LaunchStatus>> {
  try {
    const now = opts?.now ?? new Date().toISOString();

    // Admin gate.
    const user = await getUser();
    if (!user) return { ok: false, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' };
    const client = createClient();
    const role = await loadHighestRole(client, user.id);
    if (!hasRole(role ?? undefined, 'admin')) {
      return { ok: false, error: 'The Launch Operations Center is restricted to administrators.', code: 'FORBIDDEN' };
    }

    if (!supabaseConfigured()) return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };

    const env = validateStartupEnv(process.env as Record<string, string | undefined>);

    // Health probes (best-effort, parallel).
    const [supa, auth, storage] = await Promise.all([
      probeLine(probeSupabase),
      probeLine(probeAuth),
      probeLine(probeStorage),
    ]);
    const health = [supa, auth, storage].filter(Boolean) as LaunchHealthLine[];

    const applied = await loadAppliedMigrations(client);
    const migration = auditMigrations(applied);

    const testerCount = await loadTesterCount(client);

    const input: ReadinessInput = {
      appUrlConfigured: env.required.find((r) => r.key === 'NEXT_PUBLIC_APP_URL')?.present ?? false,
      supabaseConfigured: true,
      supabaseReachable: supa ? supa.ok : null,
      authReachable: auth ? auth.ok : null,
      storageReachable: storage ? storage.ok : null,
      serviceRoleConfigured: serviceRoleConfigured(),
      requiredEnvMissing: env.requiredMissing,
      migration: { ok: migration.ok, missing: migration.missing, outOfOrder: migration.outOfOrder, failed: migration.failed, verifiable: migration.verifiable },
      rbac: { resolverOk: role !== null, resolvedRole: role },
      testerCount,
      openBlockers: 0,
      debugEndpointHardened: true,
    };

    const readiness = computeReadiness(input);

    return {
      ok: true,
      data: {
        readiness,
        migration,
        env: { requiredMissing: env.requiredMissing, optionalMissing: env.optionalMissing, masked: env.masked },
        health,
        rbac: { resolvedRole: role, source: 'public.user_roles' },
        testerCount,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
        generatedAt: now,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Migration audit only — for the Security dashboard panel. ADMIN-ONLY.
 * Offline → NOT_CONFIGURED (the panel shows a labeled demo).
 */
export async function getMigrationAudit() {
  try {
    const user = await getUser();
    if (!user) return { ok: false as const, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' as const };
    const client = createClient();
    const role = await loadHighestRole(client, user.id);
    if (!hasRole(role ?? undefined, 'admin')) {
      return { ok: false as const, error: 'Admins only.', code: 'FORBIDDEN' as const };
    }
    if (!supabaseConfigured()) return { ok: false as const, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' as const };
    const applied = await loadAppliedMigrations(client);
    return { ok: true as const, data: auditMigrations(applied) };
  } catch (e) {
    return fail(e);
  }
}
