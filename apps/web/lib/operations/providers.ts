// =============================================================================
// HSIN Phase 9 — provider-run logging + rate-limit accounting DAL. SERVER-ONLY.
//
// The data-access layer for the REAL outbound provider adapters (Phase 9):
//   * provider-run observability    — hsin_provider_runs (one row per fetch);
//   * the providers console aggregate — recent runs + live rate limits + the
//     derived source-reliability profiles (ProvidersOverview);
//   * rate-limit accounting          — check/consume/upsert hsin_provider_rate_limits
//     so a provider that is exhausted (remaining<=0 within an unreset window) is
//     blocked before the network is touched;
//   * provider accounts              — hsin_provider_accounts (enabled + config).
//
// Provider credentials are read SERVER-SIDE from env (YOUTUBE_API_KEY,
// PODCAST_INDEX_API_KEY/SECRET, OPENAI_API_KEY) via providerCredentials() and are
// NEVER surfaced to the client.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). AUTHZ (migration 0013 RLS, mirrored for clean errors):
//   * hsin_provider_runs / hsin_provider_rate_limits / hsin_provider_accounts:
//     reviewer+ READ; curator/admin WRITE.
//   * hsin_source_reliability: any authenticated user READS; researcher+ WRITES.
// Reads go through the RLS client; recording a provider run + consuming a rate
// limit are curator+ writes here (the worker uses service_role and bypasses RLS).
//
// DESIGN: every exported function returns DbResult<T> and NEVER throws; empty env
// degrades gracefully (NOT_CONFIGURED). fail() uses formatErrorMessage + logError.
// =============================================================================

import type { ProviderCredentials, ProviderRunLog } from '@hsi/source-intelligence';
import type {
  HsinProviderAccountRecord,
  HsinProviderRateLimitRecord,
  HsinProviderRunRecord,
  HsinSourceReliabilityRecord,
  ProvidersOverview,
} from '@hsi/shared-types';
import {
  fail,
  type DbResult,
  type JsonRecord,
  operationsDbClient as db,
  requireOperationsRole as requireRole,
} from './persistence';

// -----------------------------------------------------------------------------
// Provider credentials — read SERVER-SIDE from env (never exposed to clients).
// -----------------------------------------------------------------------------

/** Read a trimmed, non-empty env var, or undefined. */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Resolve provider credentials from the host env. Pure read — never throws. Used
 * by the pipeline when wiring captureViaProvider; keys stay server-side.
 */
export function providerCredentials(): ProviderCredentials {
  const creds: ProviderCredentials = {};
  const yt = env('YOUTUBE_API_KEY');
  if (yt) creds.youtubeApiKey = yt;
  const pk = env('PODCAST_INDEX_API_KEY');
  if (pk) creds.podcastApiKey = pk;
  const ps = env('PODCAST_INDEX_API_SECRET');
  if (ps) creds.podcastApiSecret = ps;
  return creds;
}

/** True when OpenAI embeddings can be used (OPENAI_API_KEY present). */
export function openaiApiKey(): string | undefined {
  return env('OPENAI_API_KEY');
}

// =============================================================================
// PROVIDER RUNS — observability log (hsin_provider_runs).
// =============================================================================

/** A row to insert into hsin_provider_runs (mirrors the engine ProviderRunLog). */
export interface ProviderRunInput {
  providerName: string;
  sourceId?: string;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  reason?: string;
  itemCount?: number;
  bytes?: number;
  httpStatus?: number;
  note?: string;
}

/**
 * Record one provider-adapter invocation (curator+ via RLS). Best-effort — a
 * logging failure surfaces as a DbResult error but never blocks capture. The
 * pipeline calls recordProviderRunLog() (the ProviderRunLog overload) instead.
 */
export async function recordProviderRun(
  log: ProviderRunInput,
): Promise<DbResult<HsinProviderRunRecord>> {
  try {
    const client = db();
    const insert: JsonRecord = {
      provider_name: log.providerName,
      source_id: log.sourceId ?? null,
      started_at: log.startedAt ?? null,
      finished_at: log.finishedAt ?? null,
      ok: log.ok ?? null,
      reason: log.reason ?? null,
      item_count: log.itemCount ?? null,
      bytes: log.bytes ?? null,
      http_status: log.httpStatus ?? null,
      note: log.note ?? null,
    };
    const { data, error } = await client
      .from('hsin_provider_runs')
      .insert(insert)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinProviderRunRecord };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Insert a provider run straight from an engine ProviderRunLog (the shape every
 * provider attempt emits via makeProviderRunLog). NEVER throws — returns whether
 * the row was written so the caller can keep going on failure. Used by the
 * pipeline so each capture leaves an observability trail.
 */
export async function recordProviderRunLog(
  client: ReturnType<typeof db>,
  run: ProviderRunLog & { httpStatus?: number },
): Promise<boolean> {
  try {
    const { error } = await client.from('hsin_provider_runs').insert({
      provider_name: run.provider,
      source_id: run.sourceId ?? null,
      started_at: run.startedAt,
      finished_at: run.finishedAt,
      ok: run.ok,
      reason: run.reason ?? null,
      item_count: run.itemCount ?? null,
      bytes: run.bytes ?? null,
      http_status: run.httpStatus ?? null,
      note: run.note ?? null,
    });
    return !error;
  } catch {
    return false;
  }
}

export interface ProviderRunFilters {
  providerName?: string;
  sourceId?: string;
  ok?: boolean;
  limit?: number;
}

/** List recent provider runs (filtered), newest first. RLS: reviewer+ see rows. */
export async function listProviderRuns(
  filters?: ProviderRunFilters,
): Promise<DbResult<HsinProviderRunRecord[]>> {
  try {
    let query = db().from('hsin_provider_runs').select('*');
    if (filters?.providerName) query = query.eq('provider_name', filters.providerName);
    if (filters?.sourceId) query = query.eq('source_id', filters.sourceId);
    if (typeof filters?.ok === 'boolean') query = query.eq('ok', filters.ok);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(filters?.limit ?? 100);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinProviderRunRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// PROVIDERS OVERVIEW — recent runs + live rate limits + reliability profiles.
// =============================================================================

/**
 * Assemble the providers console aggregate. Best-effort across blocks (each
 * degrades to empty on its own error). RLS scopes visibility (reviewer+ for runs/
 * rate limits; any authenticated user for reliability). NEVER throws.
 */
export async function getProvidersOverview(): Promise<DbResult<ProvidersOverview>> {
  try {
    const client = db();

    let runs: HsinProviderRunRecord[] = [];
    {
      const { data } = await client
        .from('hsin_provider_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      runs = (data ?? []) as HsinProviderRunRecord[];
    }

    let rateLimits: HsinProviderRateLimitRecord[] = [];
    {
      const { data } = await client
        .from('hsin_provider_rate_limits')
        .select('*')
        .order('provider_name', { ascending: true });
      rateLimits = (data ?? []) as HsinProviderRateLimitRecord[];
    }

    let reliabilities: HsinSourceReliabilityRecord[] = [];
    {
      const { data } = await client
        .from('hsin_source_reliability')
        .select('*')
        .order('reliability_score', { ascending: false })
        .limit(500);
      reliabilities = (data ?? []) as HsinSourceReliabilityRecord[];
    }

    return { ok: true, data: { runs, rateLimits, reliabilities } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// PROVIDER ACCOUNTS — hsin_provider_accounts (enabled + config).
// =============================================================================

/** List provider accounts. RLS: reviewer+ see rows. */
export async function listProviderAccounts(): Promise<
  DbResult<HsinProviderAccountRecord[]>
> {
  try {
    const { data, error } = await db()
      .from('hsin_provider_accounts')
      .select('*')
      .order('provider_name', { ascending: true });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinProviderAccountRecord[] };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// RATE-LIMIT ACCOUNTING — hsin_provider_rate_limits.
//
// checkRateLimit reads the live window; consumeRateLimit decrements remaining (or
// rolls the window over when reset_at has passed); upsertRateLimit seeds/edits a
// window. The provider RPCs themselves never read these — the pipeline calls
// check before a capture and consume after, so an exhausted provider is skipped.
// =============================================================================

export interface RateLimitState {
  blocked: boolean;
  remaining?: number;
  resetAt?: string;
  reason?: string;
}

/**
 * Read a provider's live rate-limit window. `blocked` is true when remaining<=0
 * AND the window has not yet reset (reset_at in the future). An absent row is
 * treated as NOT blocked (no configured limit). NEVER throws.
 */
export async function checkRateLimit(
  providerName: string,
  now: string = new Date().toISOString(),
): Promise<DbResult<RateLimitState>> {
  try {
    const { data, error } = await db()
      .from('hsin_provider_rate_limits')
      .select('remaining_requests, reset_at')
      .eq('provider_name', providerName)
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return { ok: true, data: { blocked: false } };

    const remaining = (data.remaining_requests as number | undefined) ?? undefined;
    const resetAt = (data.reset_at as string | undefined) ?? undefined;
    const windowOpen =
      resetAt !== undefined && Date.parse(resetAt) > Date.parse(now);
    const blocked = remaining !== undefined && remaining <= 0 && windowOpen;

    return {
      ok: true,
      data: {
        blocked,
        remaining,
        resetAt,
        reason: blocked
          ? `rate limit exhausted for "${providerName}" until ${resetAt}`
          : undefined,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Consume one unit of a provider's rate-limit budget (curator+ via RLS). When the
 * window has reset (reset_at <= now) the budget rolls over to max_requests - 1 and
 * a fresh reset_at is stamped; otherwise remaining_requests is decremented (floored
 * at 0). A provider with no configured row is a no-op success. NEVER throws.
 */
export async function consumeRateLimit(
  providerName: string,
  now: string = new Date().toISOString(),
): Promise<DbResult<HsinProviderRateLimitRecord | null>> {
  try {
    const client = db();
    const { data: existing, error } = await client
      .from('hsin_provider_rate_limits')
      .select('*')
      .eq('provider_name', providerName)
      .maybeSingle();
    if (error) return fail(error);
    if (!existing) return { ok: true, data: null };

    const row = existing as HsinProviderRateLimitRecord;
    const windowSeconds = row.window_seconds ?? undefined;
    const maxRequests = row.max_requests ?? undefined;
    const resetAt = row.reset_at ?? undefined;
    const windowExpired =
      resetAt === undefined || Date.parse(resetAt) <= Date.parse(now);

    let remaining: number;
    let newResetAt: string | undefined = resetAt;
    if (windowExpired) {
      // Roll the window over: this consumption starts a fresh budget.
      remaining = maxRequests !== undefined ? Math.max(0, maxRequests - 1) : 0;
      if (windowSeconds !== undefined) {
        newResetAt = new Date(Date.parse(now) + windowSeconds * 1000).toISOString();
      }
    } else {
      const current = row.remaining_requests ?? maxRequests ?? 0;
      remaining = Math.max(0, current - 1);
    }

    const { data, error: updErr } = await client
      .from('hsin_provider_rate_limits')
      .update({ remaining_requests: remaining, reset_at: newResetAt ?? null })
      .eq('id', row.id)
      .select('*')
      .single();
    if (updErr) return fail(updErr);
    return { ok: true, data: data as HsinProviderRateLimitRecord };
  } catch (e) {
    return fail(e);
  }
}

export interface UpsertRateLimitInput {
  providerName: string;
  windowSeconds?: number;
  maxRequests?: number;
  remainingRequests?: number;
  resetAt?: string;
}

/** Seed or edit a provider rate-limit window (curator+). Unique by provider_name. */
export async function upsertRateLimit(
  input: UpsertRateLimitInput,
): Promise<DbResult<HsinProviderRateLimitRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    if (!input.providerName) {
      return {
        ok: false,
        error: 'A provider name is required.',
        code: 'DB_ERROR',
      };
    }

    const patch: JsonRecord = {
      window_seconds: input.windowSeconds ?? null,
      max_requests: input.maxRequests ?? null,
      remaining_requests: input.remainingRequests ?? null,
      reset_at: input.resetAt ?? null,
    };

    const { data: existing } = await client
      .from('hsin_provider_rate_limits')
      .select('id')
      .eq('provider_name', input.providerName)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await client
        .from('hsin_provider_rate_limits')
        .update(patch)
        .eq('id', existing.id as string)
        .select('*')
        .single();
      if (error) return fail(error);
      return { ok: true, data: data as HsinProviderRateLimitRecord };
    }

    const { data, error } = await client
      .from('hsin_provider_rate_limits')
      .insert({ provider_name: input.providerName, ...patch })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinProviderRateLimitRecord };
  } catch (e) {
    return fail(e);
  }
}
