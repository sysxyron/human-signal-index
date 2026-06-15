// =============================================================================
// HSIN Phase 7 — Human Signal Intelligence Network data-access layer (DAL).
//
// SERVER-ONLY — never import from a 'use client' module. It uses next/headers
// (via lib/supabase/server.ts), so it must stay on the server. (`server-only` is
// not installed in this workspace, hence this comment instead of the import.)
//
// OWNERSHIP / AUTHZ MODEL (mirrors lib/governance/persistence.ts, migration 0011):
//   * READS go through the cookie-backed SSR server client (createClient). RLS
//     (migration 0011) decides visibility: the hsin_ catalog is readable by any
//     authenticated user (shared team observatory). No service-role read path.
//   * WRITES resolve the authenticated user via the SAME client's auth.getUser()
//     and the caller's app role via the users table. We role-gate IN THE DAL
//     (returning FORBIDDEN below the required tier / AUTH_REQUIRED with no user)
//     AND rely on RLS as the backstop — defence in depth. We stamp the actor id
//     (created_by / reviewer_id) so the RLS owner policies authorize the write.
//     There is NO service-role write path for user-facing actions.
//
// HONESTY (binding): captured signals enter as status 'new' and are NEVER
// auto-published. Provenance is preserved (capture jobs + signal events +
// immutable versions). Alerts are explainable. A human always decides.
//
// DESIGN: every function returns a DbResult<T> and NEVER throws. Empty Supabase
// env degrades gracefully (NOT_CONFIGURED) so `next build` passes.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  classifySignal,
  type AlertDraft,
  type ChangeResult,
  type NarrativeDriftEvent,
  type SignalDraft,
} from '@hsi/source-intelligence';
import type {
  AppRole,
  HsinAlertSeverity,
  HsinAlertStatus,
  HsinAlertType,
  HsinCaptureJobRecord,
  HsinNarrativeDriftRecord,
  HsinSignalAlertRecord,
  HsinSignalDecision,
  HsinSignalRecord,
  HsinSourceHealthRecord,
  HsinSourceRecord,
  HsinWatchlistRecord,
  IntelligenceOverview,
  SignalWithContext,
  SourceWithStats,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6/7). Declared here so
// this module is self-contained, and re-exported for actions / UI.
// -----------------------------------------------------------------------------
export type DbResultCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_CONFIGURED'
  | 'DB_ERROR';

export type DbResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: DbResultCode };

const NOT_CONFIGURED =
  'Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).';

const AUTH_REQUIRED = 'Sign in to continue.';

function fail(error: unknown): { ok: false; error: string; code: DbResultCode } {
  logError('signals/persistence', error);
  if (
    error instanceof Error &&
    /required|not configured|SUPABASE_/i.test(error.message) &&
    /key|url/i.test(error.message)
  ) {
    return { ok: false, error: NOT_CONFIGURED, code: 'NOT_CONFIGURED' };
  }
  return { ok: false, error: formatErrorMessage(error), code: 'DB_ERROR' };
}

function authRequired(): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: AUTH_REQUIRED, code: 'AUTH_REQUIRED' };
}

function forbidden(required: AppRole): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return {
    ok: false,
    error: `Requires the ${required} role or higher.`,
    code: 'FORBIDDEN',
  };
}

function notFound(what: string): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  return { ok: false, error: `${what} not found or not visible.`, code: 'DB_ERROR' };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers.
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

/** Resolve the authenticated user via the cookie session, or null. */
async function currentUser(client: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user ?? null;
}

/** Ascending privilege ladder. viewer < researcher < reviewer < curator < admin. */
const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 1,
  researcher: 2,
  reviewer: 3,
  curator: 4,
  admin: 5,
};

/** Read the caller's app role from public.users (default viewer when unknown). */
async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return loadHighestRole(client, user.id);
}

/**
 * Resolve { user, role } and gate against a minimum role. Returns a DbResult
 * error (AUTH_REQUIRED / FORBIDDEN) on failure, else { user, role }.
 */
async function requireRole(
  client: SupabaseClient,
  min: AppRole,
): Promise<
  | { ok: true; user: User; role: AppRole }
  | { ok: false; error: string; code: DbResultCode }
> {
  const user = await currentUser(client);
  if (!user) return authRequired();
  const role = (await sessionRole(client)) ?? 'viewer';
  if (ROLE_LEVEL[role] < ROLE_LEVEL[min]) return forbidden(min);
  return { ok: true, user, role };
}

// -----------------------------------------------------------------------------
// Typed JSON helpers — keep `any` out of signatures.
// -----------------------------------------------------------------------------
type JsonRecord = Record<string, unknown>;

function toJson(value: unknown): JsonRecord {
  return (value ?? {}) as JsonRecord;
}

/** YYYY-MM-DD bucket from an ISO timestamp (for per-day velocity series). */
function dayBucket(iso?: string | null): string {
  if (!iso) return 'unknown';
  return iso.slice(0, 10);
}

/** Map an engine AlertSeverity-string to the HsinAlertSeverity union. */
function asAlertSeverity(s: string | undefined): HsinAlertSeverity {
  return s === 'LOW' || s === 'MEDIUM' || s === 'HIGH' || s === 'CRITICAL'
    ? s
    : 'MEDIUM';
}

// =============================================================================
// FILTERS
// =============================================================================
export interface SourceFilters {
  status?: string;
  sourceType?: string;
  search?: string;
  monitoringEnabled?: boolean;
}

export interface SignalFilters {
  search?: string;
  category?: string;
  watchlistId?: string;
  status?: string;
  sourceId?: string;
  from?: string;
  to?: string;
}

export interface AlertFilters {
  status?: HsinAlertStatus;
  severity?: HsinAlertSeverity;
  alertType?: HsinAlertType;
  sourceId?: string;
  signalId?: string;
}

// =============================================================================
// SOURCES
// =============================================================================

/**
 * List monitored sources with denormalized stats (signal counts, alert counts,
 * latest health observation, watchlist names). RLS scopes visibility (the hsin_
 * catalog is readable by any authenticated user). Best-effort per-source stats.
 */
export async function listSources(
  filters?: SourceFilters,
): Promise<DbResult<SourceWithStats[]>> {
  try {
    const client = db();

    let query = client.from('hsin_sources').select('*');
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.sourceType) query = query.eq('source_type', filters.sourceType);
    if (filters?.monitoringEnabled !== undefined) {
      query = query.eq('monitoring_enabled', filters.monitoringEnabled);
    }
    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    const { data: sourceRows, error } = await query.order('created_at', {
      ascending: false,
    });
    if (error) return fail(error);
    const sources = (sourceRows ?? []) as HsinSourceRecord[];
    if (sources.length === 0) return { ok: true, data: [] };

    const sourceIds = sources.map((s) => s.id);

    // Signal counts per source.
    const signalCountBySource = new Map<string, number>();
    {
      const { data } = await client
        .from('hsin_signals')
        .select('source_id')
        .in('source_id', sourceIds);
      for (const r of (data ?? []) as Array<{ source_id?: string }>) {
        if (r.source_id) {
          signalCountBySource.set(
            r.source_id,
            (signalCountBySource.get(r.source_id) ?? 0) + 1,
          );
        }
      }
    }

    // Alert counts per source.
    const alertCountBySource = new Map<string, number>();
    {
      const { data } = await client
        .from('hsin_signal_alerts')
        .select('source_id')
        .in('source_id', sourceIds);
      for (const r of (data ?? []) as Array<{ source_id?: string }>) {
        if (r.source_id) {
          alertCountBySource.set(
            r.source_id,
            (alertCountBySource.get(r.source_id) ?? 0) + 1,
          );
        }
      }
    }

    // Latest health per source (one query, newest first, first-seen wins).
    const healthBySource = new Map<string, HsinSourceHealthRecord>();
    {
      const { data } = await client
        .from('hsin_source_health')
        .select('*')
        .in('source_id', sourceIds)
        .order('created_at', { ascending: false });
      for (const h of (data ?? []) as HsinSourceHealthRecord[]) {
        if (!healthBySource.has(h.source_id)) healthBySource.set(h.source_id, h);
      }
    }

    // Watchlist names per source (via hsin_watchlist_sources -> hsin_watchlists).
    const watchlistsBySource = new Map<string, string[]>();
    {
      const { data: scopeRows } = await client
        .from('hsin_watchlist_sources')
        .select('watchlist_id, source_id')
        .in('source_id', sourceIds);
      const scopes = (scopeRows ?? []) as Array<{
        watchlist_id: string;
        source_id: string;
      }>;
      const watchlistIds = Array.from(new Set(scopes.map((s) => s.watchlist_id)));
      const nameById = new Map<string, string>();
      if (watchlistIds.length > 0) {
        const { data: wlRows } = await client
          .from('hsin_watchlists')
          .select('id, name')
          .in('id', watchlistIds);
        for (const w of (wlRows ?? []) as Array<{ id: string; name: string }>) {
          nameById.set(w.id, w.name);
        }
      }
      for (const s of scopes) {
        const name = nameById.get(s.watchlist_id);
        if (!name) continue;
        const arr = watchlistsBySource.get(s.source_id) ?? [];
        arr.push(name);
        watchlistsBySource.set(s.source_id, arr);
      }
    }

    const items: SourceWithStats[] = sources.map((source) => ({
      source,
      health: healthBySource.get(source.id),
      signalCount: signalCountBySource.get(source.id) ?? 0,
      alertCount: alertCountBySource.get(source.id) ?? 0,
      watchlists: watchlistsBySource.get(source.id) ?? [],
    }));

    return { ok: true, data: items };
  } catch (e) {
    return fail(e);
  }
}

/** Full detail bundle for one source. */
export interface SourceDetail {
  source: HsinSourceRecord;
  healthTimeline: HsinSourceHealthRecord[];
  recentSignals: HsinSignalRecord[];
  recentAlerts: HsinSignalAlertRecord[];
  watchlists: string[];
  narrativeDrift: HsinNarrativeDriftRecord[];
  /** research_runs.id values linked to this source's signals (via origin_signal_id). */
  linkedResearchRunIds: string[];
}

/**
 * Full detail for one source: the source + health timeline + recent signals +
 * recent alerts + watchlist membership + narrative drift timeline + linked
 * research runs (research_runs.origin_signal_id of this source's signals).
 */
export async function getSource(id: string): Promise<DbResult<SourceDetail>> {
  try {
    const client = db();

    const { data: sourceRow, error: srcErr } = await client
      .from('hsin_sources')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (srcErr) return fail(srcErr);
    if (!sourceRow) return notFound('Source');
    const source = sourceRow as HsinSourceRecord;

    const { data: healthRows } = await client
      .from('hsin_source_health')
      .select('*')
      .eq('source_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    const { data: signalRows } = await client
      .from('hsin_signals')
      .select('*')
      .eq('source_id', id)
      .order('created_at', { ascending: false })
      .limit(25);
    const signals = (signalRows ?? []) as HsinSignalRecord[];

    const { data: alertRows } = await client
      .from('hsin_signal_alerts')
      .select('*')
      .eq('source_id', id)
      .order('created_at', { ascending: false })
      .limit(25);

    const { data: driftRows } = await client
      .from('hsin_narrative_drift')
      .select('*')
      .eq('source_id', id)
      .order('detected_at', { ascending: false })
      .limit(50);

    // Watchlist names scoped to this source.
    const watchlists: string[] = [];
    {
      const { data: scopeRows } = await client
        .from('hsin_watchlist_sources')
        .select('watchlist_id')
        .eq('source_id', id);
      const ids = ((scopeRows ?? []) as Array<{ watchlist_id: string }>).map(
        (r) => r.watchlist_id,
      );
      if (ids.length > 0) {
        const { data: wlRows } = await client
          .from('hsin_watchlists')
          .select('name')
          .in('id', ids);
        for (const w of (wlRows ?? []) as Array<{ name: string }>) {
          watchlists.push(w.name);
        }
      }
    }

    // Linked research runs via origin_signal_id of this source's signals.
    const linkedResearchRunIds: string[] = [];
    if (signals.length > 0) {
      const signalIds = signals.map((s) => s.id);
      const { data: runRows } = await client
        .from('research_runs')
        .select('id, origin_signal_id')
        .in('origin_signal_id', signalIds);
      for (const r of (runRows ?? []) as Array<{ id: string }>) {
        linkedResearchRunIds.push(r.id);
      }
    }

    return {
      ok: true,
      data: {
        source,
        healthTimeline: (healthRows ?? []) as HsinSourceHealthRecord[],
        recentSignals: signals,
        recentAlerts: (alertRows ?? []) as HsinSignalAlertRecord[],
        watchlists,
        narrativeDrift: (driftRows ?? []) as HsinNarrativeDriftRecord[],
        linkedResearchRunIds,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export interface CreateSourceInput {
  name: string;
  description?: string;
  sourceType: string;
  platform?: string;
  homepageUrl?: string;
  rssUrl?: string;
  riskLevel?: number;
  monitoringEnabled?: boolean;
  config?: Record<string, unknown>;
}

/** Create a monitored source (researcher+, created_by = user.id). */
export async function createSource(
  input: CreateSourceInput,
): Promise<DbResult<HsinSourceRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    if (!input.name || !input.sourceType) {
      return { ok: false, error: 'A source name and source_type are required.', code: 'DB_ERROR' };
    }

    const { data, error } = await client
      .from('hsin_sources')
      .insert({
        name: input.name,
        description: input.description ?? null,
        source_type: input.sourceType,
        platform: input.platform ?? null,
        homepage_url: input.homepageUrl ?? null,
        rss_url: input.rssUrl ?? null,
        risk_level: input.riskLevel ?? 1,
        monitoring_enabled: input.monitoringEnabled ?? true,
        config: input.config ?? {},
        status: 'active',
        created_by: gate.user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinSourceRecord };
  } catch (e) {
    return fail(e);
  }
}

export interface UpdateSourcePatch {
  name?: string;
  description?: string;
  platform?: string;
  homepageUrl?: string;
  rssUrl?: string;
  riskLevel?: number;
  status?: string;
  monitoringEnabled?: boolean;
  config?: Record<string, unknown>;
}

/** Update a source (researcher+; owner or reviewer+ authorized by RLS). */
export async function updateSource(
  id: string,
  patch: UpdateSourcePatch,
): Promise<DbResult<HsinSourceRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const update: JsonRecord = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.platform !== undefined) update.platform = patch.platform;
    if (patch.homepageUrl !== undefined) update.homepage_url = patch.homepageUrl;
    if (patch.rssUrl !== undefined) update.rss_url = patch.rssUrl;
    if (patch.riskLevel !== undefined) update.risk_level = patch.riskLevel;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.monitoringEnabled !== undefined) {
      update.monitoring_enabled = patch.monitoringEnabled;
    }
    if (patch.config !== undefined) update.config = patch.config;

    const { data, error } = await client
      .from('hsin_sources')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinSourceRecord };
  } catch (e) {
    return fail(e);
  }
}

/** Disable a source (status='disabled', monitoring_enabled=false). researcher+. */
export async function disableSource(
  id: string,
): Promise<DbResult<HsinSourceRecord>> {
  return updateSource(id, { status: 'disabled', monitoringEnabled: false });
}

/**
 * Phase 40 — seed the recommended starter sources (admin only). Each is created
 * via @hsi/source-collectors normalization, DISABLED by default (safe opt-in), and
 * skipped if a same-named source already exists. Returns how many were created.
 */
export async function seedRecommendedSources(): Promise<DbResult<{ created: number; skipped: number }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'admin');
    if (!gate.ok) return gate;

    const { RECOMMENDED_SOURCES, normalizeSourceInput } = await import('@hsi/source-collectors');
    const { data: existing } = await client.from('hsin_sources').select('name');
    const have = new Set(((existing ?? []) as Array<{ name: string }>).map((r) => r.name));

    let created = 0;
    let skipped = 0;
    for (const seed of RECOMMENDED_SOURCES) {
      if (have.has(seed.name)) { skipped += 1; continue; }
      const normalized = normalizeSourceInput({ sourceType: seed.sourceType, url: seed.url, rssUrl: seed.url, homepageUrl: seed.url });
      const { error } = await client.from('hsin_sources').insert({
        name: seed.name,
        description: seed.description,
        source_type: seed.sourceType,
        homepage_url: normalized?.homepageUrl ?? seed.url,
        rss_url: normalized?.rssUrl ?? null,
        risk_level: seed.riskLevel,
        monitoring_enabled: seed.enabledByDefault,
        config: normalized?.config ?? {},
        status: seed.enabledByDefault ? 'active' : 'paused',
        created_by: gate.user.id,
      });
      if (error) { skipped += 1; continue; }
      created += 1;
    }
    return { ok: true, data: { created, skipped } };
  } catch (e) {
    return fail(e);
  }
}

/** Add a source to a group (researcher+; parent-authorized by RLS). */
export async function addSourceToGroup(
  sourceId: string,
  groupId: string,
): Promise<DbResult<{ id: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('hsin_source_group_members')
      .insert({ group_id: groupId, source_id: sourceId })
      .select('id')
      .single();
    if (error) return fail(error);
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return fail(e);
  }
}

/** Scope a watchlist to a source (researcher+; parent-authorized by RLS). */
export async function addSourceToWatchlist(
  sourceId: string,
  watchlistId: string,
): Promise<DbResult<{ id: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('hsin_watchlist_sources')
      .insert({ watchlist_id: watchlistId, source_id: sourceId })
      .select('id')
      .single();
    if (error) return fail(error);
    return { ok: true, data: { id: data.id as string } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// SIGNALS
// =============================================================================

/**
 * List captured signals (joined to their source name), filtered. The watchlist
 * filter resolves the watchlist's terms/category and matches signals whose
 * title/summary/category contain a term (best-effort post-filter so it works
 * across the RLS catalog without a server-side join).
 */
export async function listSignals(
  filters?: SignalFilters,
): Promise<DbResult<Array<HsinSignalRecord & { sourceName?: string }>>> {
  try {
    const client = db();

    let query = client.from('hsin_signals').select('*');
    if (filters?.category) query = query.eq('signal_category', filters.category);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.sourceId) query = query.eq('source_id', filters.sourceId);
    if (filters?.from) query = query.gte('created_at', filters.from);
    if (filters?.to) query = query.lte('created_at', filters.to);
    if (filters?.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return fail(error);
    let signals = (data ?? []) as HsinSignalRecord[];

    // Watchlist filter: keep signals matching any of the watchlist's terms
    // (case-insensitive) or whose category equals a term.
    if (filters?.watchlistId) {
      const { data: wlRow } = await client
        .from('hsin_watchlists')
        .select('terms')
        .eq('id', filters.watchlistId)
        .maybeSingle();
      const terms = ((wlRow?.terms as string[] | undefined) ?? []).map((t) =>
        t.toLowerCase(),
      );
      if (terms.length > 0) {
        signals = signals.filter((s) => {
          const hay = `${s.title}\n${s.summary ?? ''}\n${s.signal_category ?? ''}`.toLowerCase();
          return terms.some((t) => hay.includes(t));
        });
      }
    }

    // Attach source names (best-effort).
    const sourceIds = Array.from(
      new Set(signals.map((s) => s.source_id).filter((v): v is string => !!v)),
    );
    const nameById = new Map<string, string>();
    if (sourceIds.length > 0) {
      const { data: srcRows } = await client
        .from('hsin_sources')
        .select('id, name')
        .in('id', sourceIds);
      for (const r of (srcRows ?? []) as Array<{ id: string; name: string }>) {
        nameById.set(r.id, r.name);
      }
    }

    return {
      ok: true,
      data: signals.map((s) => ({
        ...s,
        sourceName: s.source_id ? nameById.get(s.source_id) : undefined,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/** Full context for one signal (SignalWithContext + provenance). */
export interface SignalDetail extends SignalWithContext {
  /** Capture job(s) that produced/touched this signal's source (provenance). */
  captureJobs: HsinCaptureJobRecord[];
  /** Append-only signal event log (provenance). */
  events: Array<{
    id: string;
    signal_id: string;
    event_type: string;
    event_payload?: JsonRecord;
    created_at: string;
  }>;
}

/**
 * Load one signal with full surrounding context: source + version count + tags +
 * alerts + review status (latest hsin_signal_reviews decision) + linked research
 * runs (research_runs.origin_signal_id = id) + provenance (capture jobs of the
 * source + the signal's event log).
 */
export async function getSignal(id: string): Promise<DbResult<SignalDetail>> {
  try {
    const client = db();

    const { data: signalRow, error: sigErr } = await client
      .from('hsin_signals')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (sigErr) return fail(sigErr);
    if (!signalRow) return notFound('Signal');
    const signal = signalRow as HsinSignalRecord;

    // Source.
    let source: HsinSourceRecord | undefined;
    if (signal.source_id) {
      const { data: srcRow } = await client
        .from('hsin_sources')
        .select('*')
        .eq('id', signal.source_id)
        .maybeSingle();
      source = (srcRow as HsinSourceRecord | null) ?? undefined;
    }

    // Version count.
    const { count: versionCount } = await client
      .from('hsin_signal_versions')
      .select('id', { count: 'exact', head: true })
      .eq('signal_id', id);

    // Tags.
    const { data: tagRows } = await client
      .from('hsin_signal_tags')
      .select('tag')
      .eq('signal_id', id);
    const tags = ((tagRows ?? []) as Array<{ tag: string }>).map((t) => t.tag);

    // Alerts.
    const { data: alertRows } = await client
      .from('hsin_signal_alerts')
      .select('*')
      .eq('signal_id', id)
      .order('created_at', { ascending: false });

    // Latest review verdict.
    const { data: reviewRows } = await client
      .from('hsin_signal_reviews')
      .select('decision')
      .eq('signal_id', id)
      .order('created_at', { ascending: false })
      .limit(1);
    const reviewStatus =
      ((reviewRows ?? [])[0]?.decision as string | undefined) ?? undefined;

    // Linked research runs.
    const researchRunIds: string[] = [];
    {
      const { data: runRows } = await client
        .from('research_runs')
        .select('id')
        .eq('origin_signal_id', id);
      for (const r of (runRows ?? []) as Array<{ id: string }>) {
        researchRunIds.push(r.id);
      }
    }

    // Provenance: capture jobs for the source + the signal's event log.
    let captureJobs: HsinCaptureJobRecord[] = [];
    if (signal.source_id) {
      const { data: jobRows } = await client
        .from('hsin_capture_jobs')
        .select('*')
        .eq('source_id', signal.source_id)
        .order('created_at', { ascending: false })
        .limit(10);
      captureJobs = (jobRows ?? []) as HsinCaptureJobRecord[];
    }
    const { data: eventRows } = await client
      .from('hsin_signal_events')
      .select('*')
      .eq('signal_id', id)
      .order('created_at', { ascending: true });

    return {
      ok: true,
      data: {
        signal,
        source,
        versionCount: versionCount ?? 0,
        tags,
        alerts: (alertRows ?? []) as HsinSignalAlertRecord[],
        reviewStatus,
        researchRunIds,
        captureJobs,
        events: (eventRows ?? []) as SignalDetail['events'],
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export interface ManualSignalInput {
  sourceId: string;
  title: string;
  summary: string;
  rawContent?: string;
  category: string;
  tags?: string[];
}

/**
 * Submit a manual signal (researcher+). Requires source + category + summary.
 * Classifies via the deterministic engine (classifySignal), inserts the signal
 * at status 'new' + an initial immutable version (1) + a 'manual_submitted'
 * event. Honesty: enters 'new' — NEVER published.
 */
export async function submitManualSignal(
  input: ManualSignalInput,
): Promise<DbResult<HsinSignalRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    if (!input.sourceId || !input.category || !input.summary) {
      return {
        ok: false,
        error: 'A source, category, and summary are required.',
        code: 'DB_ERROR',
      };
    }

    // Deterministic classification for type/confidence; the human-supplied
    // category is authoritative (we keep the engine's signalType + confidence).
    const classification = classifySignal({
      title: input.title,
      bodyText: input.rawContent ?? input.summary,
      sourceType: 'manual',
      extraCategories: [input.category],
    });

    const { data: signalRow, error: sigErr } = await client
      .from('hsin_signals')
      .insert({
        source_id: input.sourceId,
        title: input.title,
        summary: input.summary,
        raw_content: input.rawContent ?? null,
        signal_type: 'manual_submission',
        signal_category: input.category,
        confidence: classification.confidence,
        status: 'new',
        captured_at: new Date().toISOString(),
        created_by: gate.user.id,
      })
      .select('*')
      .single();
    if (sigErr) return fail(sigErr);
    const signal = signalRow as HsinSignalRecord;

    // Initial immutable version snapshot.
    await client
      .from('hsin_signal_versions')
      .insert({
        signal_id: signal.id,
        version_number: 1,
        snapshot_json: toJson({
          title: signal.title,
          summary: signal.summary,
          raw_content: signal.raw_content,
          signal_category: signal.signal_category,
          classification,
        }),
      })
      .then(() => undefined, () => undefined);

    // Provenance event.
    await client
      .from('hsin_signal_events')
      .insert({
        signal_id: signal.id,
        event_type: 'manual_submitted',
        event_payload: toJson({ by: gate.user.id, classification }),
      })
      .then(() => undefined, () => undefined);

    // Tags (best-effort).
    if (input.tags && input.tags.length > 0) {
      await client
        .from('hsin_signal_tags')
        .insert(input.tags.map((tag) => ({ signal_id: signal.id, tag })))
        .then(() => undefined, () => undefined);
    }

    return { ok: true, data: signal };
  } catch (e) {
    return fail(e);
  }
}

/** Map a signal review decision to the resulting hsin_signals.status. */
const SIGNAL_DECISION_TO_STATUS: Record<HsinSignalDecision, string> = {
  APPROVE: 'approved',
  REJECT: 'rejected',
  NEEDS_RESEARCH: 'needs_research',
  ESCALATE: 'reviewing',
};

/**
 * Review a captured signal (reviewer+). Inserts an immutable hsin_signal_reviews
 * row (reviewer_id = auth.uid()), maps the decision to hsin_signals.status, logs
 * a 'reviewed' signal event, and for ESCALATE raises a review_escalation alert.
 *
 * Honesty: NEEDS_RESEARCH is handled here only by status — the actual research
 * run is created by the dedicated createResearchFromSignalAction (so the
 * signal→research handoff stays in one auditable place).
 */
export async function reviewSignal(
  signalId: string,
  decision: HsinSignalDecision,
  notes?: string,
): Promise<DbResult<{ status: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    const { data: signalRow, error: sigErr } = await client
      .from('hsin_signals')
      .select('id, source_id')
      .eq('id', signalId)
      .maybeSingle();
    if (sigErr) return fail(sigErr);
    if (!signalRow) return notFound('Signal');

    // Immutable verdict.
    const { error: revErr } = await client.from('hsin_signal_reviews').insert({
      signal_id: signalId,
      reviewer_id: gate.user.id,
      decision,
      notes: notes ?? null,
    });
    if (revErr) return fail(revErr);

    const status = SIGNAL_DECISION_TO_STATUS[decision];
    const { error: updErr } = await client
      .from('hsin_signals')
      .update({ status })
      .eq('id', signalId);
    if (updErr) return fail(updErr);

    await client
      .from('hsin_signal_events')
      .insert({
        signal_id: signalId,
        event_type: 'reviewed',
        event_payload: toJson({ decision, status, by: gate.user.id, notes: notes ?? null }),
      })
      .then(() => undefined, () => undefined);

    // ESCALATE → a review_escalation alert (HIGH), kept open for triage.
    if (decision === 'ESCALATE') {
      await client
        .from('hsin_signal_alerts')
        .insert({
          signal_id: signalId,
          source_id: (signalRow as { source_id?: string }).source_id ?? null,
          alert_type: 'review_escalation',
          severity: 'HIGH',
          title: 'Signal escalated by reviewer',
          explanation:
            'A reviewer escalated this signal for priority handling. ' +
            (notes ? `Note: ${notes}` : 'No additional note provided.'),
          status: 'open',
        })
        .then(() => undefined, () => undefined);
    }

    return { ok: true, data: { status } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// WATCHLISTS
// =============================================================================

/** List watchlists visible to the caller (RLS), newest first. */
export async function listWatchlists(): Promise<DbResult<HsinWatchlistRecord[]>> {
  try {
    const { data, error } = await db()
      .from('hsin_watchlists')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinWatchlistRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export interface CreateWatchlistInput {
  name: string;
  description?: string;
  severity?: HsinAlertSeverity;
  terms?: string[];
}

/** Create a watchlist (researcher+, created_by = user.id). */
export async function createWatchlist(
  input: CreateWatchlistInput,
): Promise<DbResult<HsinWatchlistRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    if (!input.name) {
      return { ok: false, error: 'A watchlist name is required.', code: 'DB_ERROR' };
    }

    const { data, error } = await client
      .from('hsin_watchlists')
      .insert({
        name: input.name,
        description: input.description ?? null,
        severity: input.severity ?? 'MEDIUM',
        terms: input.terms ?? [],
        created_by: gate.user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinWatchlistRecord };
  } catch (e) {
    return fail(e);
  }
}

/** Scope a source to a watchlist (researcher+). Alias-friendly for actions. */
export async function addWatchlistSource(
  watchlistId: string,
  sourceId: string,
): Promise<DbResult<{ id: string }>> {
  return addSourceToWatchlist(sourceId, watchlistId);
}

// =============================================================================
// ALERTS
// =============================================================================

/** A network alert plus light signal/source context for the alert list view. */
export interface AlertWithContext extends HsinSignalAlertRecord {
  signalTitle?: string;
  sourceName?: string;
}

/** List alerts (filtered) with signal/source context. RLS-scoped. */
export async function listAlerts(
  filters?: AlertFilters,
): Promise<DbResult<AlertWithContext[]>> {
  try {
    const client = db();

    let query = client.from('hsin_signal_alerts').select('*');
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.severity) query = query.eq('severity', filters.severity);
    if (filters?.alertType) query = query.eq('alert_type', filters.alertType);
    if (filters?.sourceId) query = query.eq('source_id', filters.sourceId);
    if (filters?.signalId) query = query.eq('signal_id', filters.signalId);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return fail(error);
    const alerts = (data ?? []) as HsinSignalAlertRecord[];
    if (alerts.length === 0) return { ok: true, data: [] };

    const signalIds = Array.from(
      new Set(alerts.map((a) => a.signal_id).filter((v): v is string => !!v)),
    );
    const sourceIds = Array.from(
      new Set(alerts.map((a) => a.source_id).filter((v): v is string => !!v)),
    );

    const signalTitleById = new Map<string, string>();
    if (signalIds.length > 0) {
      const { data: sigRows } = await client
        .from('hsin_signals')
        .select('id, title')
        .in('id', signalIds);
      for (const r of (sigRows ?? []) as Array<{ id: string; title: string }>) {
        signalTitleById.set(r.id, r.title);
      }
    }
    const sourceNameById = new Map<string, string>();
    if (sourceIds.length > 0) {
      const { data: srcRows } = await client
        .from('hsin_sources')
        .select('id, name')
        .in('id', sourceIds);
      for (const r of (srcRows ?? []) as Array<{ id: string; name: string }>) {
        sourceNameById.set(r.id, r.name);
      }
    }

    return {
      ok: true,
      data: alerts.map((a) => ({
        ...a,
        signalTitle: a.signal_id ? signalTitleById.get(a.signal_id) : undefined,
        sourceName: a.source_id ? sourceNameById.get(a.source_id) : undefined,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/** Acknowledge an alert (reviewer+; status 'acknowledged'). */
export async function acknowledgeAlert(
  id: string,
): Promise<DbResult<HsinSignalAlertRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('hsin_signal_alerts')
      .update({ status: 'acknowledged' })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinSignalAlertRecord };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Escalate an alert (reviewer+; status 'escalated'). Best-effort also files a
 * review_queue entry (Phase 6) for the linked signal so the escalation surfaces
 * in the curation worklist.
 */
export async function escalateAlert(
  id: string,
): Promise<DbResult<HsinSignalAlertRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'reviewer');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('hsin_signal_alerts')
      .update({ status: 'escalated' })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    const alert = data as HsinSignalAlertRecord;

    // Best-effort: surface the escalation in the Phase-6 review queue.
    if (alert.signal_id) {
      await client
        .from('review_queues')
        .insert({
          entity_type: 'signal',
          entity_id: alert.signal_id,
          status: 'escalated',
          priority: 'high',
          created_by: gate.user.id,
        })
        .then(() => undefined, () => undefined);
    }

    return { ok: true, data: alert };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// INTELLIGENCE OVERVIEW
// =============================================================================

/**
 * Assemble the intelligence overview dashboard aggregate. Best-effort across the
 * board (each block degrades to its default on its own error). Never throws.
 */
export async function getIntelligenceOverview(): Promise<
  DbResult<IntelligenceOverview>
> {
  try {
    const client = db();

    // Sources: total + active.
    let totalSources = 0;
    let activeSources = 0;
    {
      const { count: total } = await client
        .from('hsin_sources')
        .select('id', { count: 'exact', head: true });
      totalSources = total ?? 0;
      const { count: active } = await client
        .from('hsin_sources')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      activeSources = active ?? 0;
    }

    // Signals: captured (all) + reviewed (status beyond 'new').
    let signalsCaptured = 0;
    const signalVelocity: { date: string; count: number }[] = [];
    {
      const { count } = await client
        .from('hsin_signals')
        .select('id', { count: 'exact', head: true });
      signalsCaptured = count ?? 0;

      // Velocity: per-day counts over the most recent signals.
      const { data: rows } = await client
        .from('hsin_signals')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      const byDay = new Map<string, number>();
      for (const r of (rows ?? []) as Array<{ created_at: string }>) {
        const d = dayBucket(r.created_at);
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      for (const [date, count2] of Array.from(byDay.entries()).sort()) {
        signalVelocity.push({ date, count: count2 });
      }
    }
    let signalsReviewed = 0;
    {
      const { count } = await client
        .from('hsin_signals')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'new');
      signalsReviewed = count ?? 0;
    }

    // Alerts: watchlist matches + per-day activity.
    let watchlistMatches = 0;
    const alertActivity: { date: string; count: number }[] = [];
    {
      const { count } = await client
        .from('hsin_signal_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('alert_type', 'watchlist_match');
      watchlistMatches = count ?? 0;

      const { data: rows } = await client
        .from('hsin_signal_alerts')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      const byDay = new Map<string, number>();
      for (const r of (rows ?? []) as Array<{ created_at: string }>) {
        const d = dayBucket(r.created_at);
        byDay.set(d, (byDay.get(d) ?? 0) + 1);
      }
      for (const [date, count2] of Array.from(byDay.entries()).sort()) {
        alertActivity.push({ date, count: count2 });
      }
    }

    // Narrative shifts.
    let narrativeShifts = 0;
    {
      const { count } = await client
        .from('hsin_narrative_drift')
        .select('id', { count: 'exact', head: true });
      narrativeShifts = count ?? 0;
    }

    // Research runs generated from signals (origin_signal_id not null).
    let researchRunsGenerated = 0;
    {
      const { count } = await client
        .from('research_runs')
        .select('id', { count: 'exact', head: true })
        .not('origin_signal_id', 'is', null);
      researchRunsGenerated = count ?? 0;
    }

    // Publications generated from signals (Phase-6 publication_records of signals).
    let publicationsGenerated = 0;
    {
      const { count } = await client
        .from('publication_records')
        .select('id', { count: 'exact', head: true })
        .eq('entity_type', 'signal');
      publicationsGenerated = count ?? 0;
    }

    // Source health summary: latest-per-source status -> count.
    const sourceHealthSummary: Record<string, number> = {};
    {
      const { data: rows } = await client
        .from('hsin_source_health')
        .select('source_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);
      const seen = new Set<string>();
      for (const r of (rows ?? []) as Array<{
        source_id: string;
        status?: string;
      }>) {
        if (seen.has(r.source_id)) continue;
        seen.add(r.source_id);
        const status = r.status ?? 'unknown';
        sourceHealthSummary[status] = (sourceHealthSummary[status] ?? 0) + 1;
      }
    }

    return {
      ok: true,
      data: {
        totalSources,
        activeSources,
        signalsCaptured,
        signalsReviewed,
        watchlistMatches,
        narrativeShifts,
        researchRunsGenerated,
        publicationsGenerated,
        sourceHealthSummary,
        signalVelocity,
        alertActivity,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// CAPTURE PERSISTENCE — used by the pipeline + worker jobs.
//
// These write the capture provenance + signals/versions/alerts/drift/health.
// They take a SupabaseClient so a caller (the pipeline) can share one authed
// client across the whole persist, and so the worker can pass a (service-role)
// client. They never throw; callers wrap in DbResult at their boundary.
// =============================================================================

/** Open or close a capture job for a source. Returns the job id. */
export async function recordCaptureJob(
  client: SupabaseClient,
  sourceId: string,
  outcome: {
    status: 'pending' | 'running' | 'success' | 'failed';
    startedAt?: string;
    finishedAt?: string;
    errorMessage?: string;
  },
): Promise<string | null> {
  try {
    const { data } = await client
      .from('hsin_capture_jobs')
      .insert({
        source_id: sourceId,
        status: outcome.status,
        started_at: outcome.startedAt ?? null,
        finished_at: outcome.finishedAt ?? null,
        error_message: outcome.errorMessage ?? null,
      })
      .select('id')
      .single();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Persist a signal from an engine SignalDraft against a source. Dedupe by
 * content_hash: if a signal with the same hash already exists for the source,
 * we APPEND a new immutable version + a 'source_changed' event instead of
 * inserting a duplicate signal. Otherwise we insert a new signal (status 'new'),
 * its version 1, and a 'captured' event. Returns the signal id (existing or new).
 *
 * Honesty: signals ALWAYS enter at status 'new'. Never auto-published.
 */
export async function persistSignalFromDraft(
  client: SupabaseClient,
  draft: SignalDraft,
  sourceId: string,
  createdBy?: string,
): Promise<{ signalId: string; deduped: boolean } | null> {
  try {
    // Dedupe by content hash within the source.
    if (draft.contentHash) {
      const { data: existing } = await client
        .from('hsin_signals')
        .select('id')
        .eq('source_id', sourceId)
        .eq('content_hash', draft.contentHash)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const signalId = existing.id as string;
        // Append a new version reflecting the re-observation.
        const { data: lastVersion } = await client
          .from('hsin_signal_versions')
          .select('version_number')
          .eq('signal_id', signalId)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        const next =
          ((lastVersion?.version_number as number | undefined) ?? 0) + 1;
        await client
          .from('hsin_signal_versions')
          .insert({
            signal_id: signalId,
            version_number: next,
            snapshot_json: toJson(draft),
          })
          .then(() => undefined, () => undefined);
        await client
          .from('hsin_signal_events')
          .insert({
            signal_id: signalId,
            event_type: 'source_changed',
            event_payload: toJson({ contentHash: draft.contentHash, version: next }),
          })
          .then(() => undefined, () => undefined);
        return { signalId, deduped: true };
      }
    }

    // Insert a new signal.
    const { data: signalRow, error } = await client
      .from('hsin_signals')
      .insert({
        source_id: sourceId,
        title: draft.title,
        summary: draft.summary ?? null,
        raw_content: draft.rawContent ?? null,
        content_hash: draft.contentHash ?? null,
        signal_type: draft.signalType,
        signal_category: draft.signalCategory,
        confidence: draft.confidence,
        status: 'new',
        captured_at: draft.capturedAt,
        created_by: createdBy ?? null,
      })
      .select('id')
      .single();
    if (error || !signalRow) return null;
    const signalId = signalRow.id as string;

    await client
      .from('hsin_signal_versions')
      .insert({
        signal_id: signalId,
        version_number: 1,
        snapshot_json: toJson(draft),
      })
      .then(() => undefined, () => undefined);
    await client
      .from('hsin_signal_events')
      .insert({
        signal_id: signalId,
        event_type: 'captured',
        event_payload: toJson({ contentHash: draft.contentHash, source_id: sourceId }),
      })
      .then(() => undefined, () => undefined);

    if (draft.tags && draft.tags.length > 0) {
      await client
        .from('hsin_signal_tags')
        .insert(draft.tags.map((tag) => ({ signal_id: signalId, tag })))
        .then(() => undefined, () => undefined);
    }

    return { signalId, deduped: false };
  } catch {
    return null;
  }
}

/** Persist a batch of engine AlertDrafts. Best-effort; returns count inserted. */
export async function persistAlerts(
  client: SupabaseClient,
  drafts: AlertDraft[],
  link?: { signalId?: string; sourceId?: string },
): Promise<number> {
  if (drafts.length === 0) return 0;
  try {
    const rows = drafts.map((d) => ({
      signal_id: d.signalId ?? link?.signalId ?? null,
      source_id: d.sourceId ?? link?.sourceId ?? null,
      alert_type: d.alertType,
      severity: asAlertSeverity(d.severity),
      title: d.title,
      explanation: d.explanation,
      status: 'open',
    }));
    const { data } = await client
      .from('hsin_signal_alerts')
      .insert(rows)
      .select('id');
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/** Persist a detected narrative-drift event. Returns the row id, or null. */
export async function persistDrift(
  client: SupabaseClient,
  event: NarrativeDriftEvent,
  sourceId: string,
  signalId?: string,
): Promise<string | null> {
  try {
    const { data } = await client
      .from('hsin_narrative_drift')
      .insert({
        source_id: sourceId,
        signal_id: signalId ?? null,
        before_text: event.before,
        after_text: event.after,
        explanation: event.explanation,
        confidence: event.confidence,
        drift_score: event.driftScore,
        detected_at: event.detectedAt,
      })
      .select('id')
      .single();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Insert a point-in-time source health observation. Best-effort. */
export async function updateSourceHealth(
  client: SupabaseClient,
  sourceId: string,
  health: {
    status?: string;
    responseTime?: number;
    lastSuccess?: string;
    lastFailure?: string;
    failureCount?: number;
  },
): Promise<void> {
  try {
    await client.from('hsin_source_health').insert({
      source_id: sourceId,
      status: health.status ?? null,
      response_time: health.responseTime ?? null,
      last_success: health.lastSuccess ?? null,
      last_failure: health.lastFailure ?? null,
      failure_count: health.failureCount ?? 0,
    });
  } catch {
    // best-effort
  }
}

/** Touch a source's last_checked_at (+ last_changed_at when changed). */
export async function touchSourceChecked(
  client: SupabaseClient,
  sourceId: string,
  changed: boolean,
  now: string,
): Promise<void> {
  try {
    const update: JsonRecord = { last_checked_at: now };
    if (changed) update.last_changed_at = now;
    await client.from('hsin_sources').update(update).eq('id', sourceId);
  } catch {
    // best-effort
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the pipeline (which
// runs the engine and then persists through the same authed client).
// -----------------------------------------------------------------------------
export { db as signalsDbClient, requireRole as requireSignalsRole };
