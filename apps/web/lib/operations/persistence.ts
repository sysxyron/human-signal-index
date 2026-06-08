// =============================================================================
// HSIN Phase 8 — Operations data-access layer (DAL). SERVER-ONLY.
//
// The persistence layer for the Phase-8 operations console + narrative graph:
//   * Operations: the job queue (hsin_job_queue) + per-attempt log
//     (hsin_job_attempts), source health, provider rate limits, scheduler rules,
//     and capture/alert throughput aggregates.
//   * Scheduler: cron-style rules (hsin_scheduler_rules), validated via the pure
//     '@hsi/scheduler' cron parser before persistence.
//   * Triage / SLA: stored rules merged with the engine DEFAULT_TRIAGE_RULES;
//     stored SLA policies with a DEFAULT_SLA_POLICIES fallback.
//   * Narrative graph: read/persist the entity + narrative knowledge graph
//     (hsin_entities/hsin_signal_entities/hsin_narratives/hsin_signal_narratives/
//     hsin_narrative_edges) from a source-intelligence NarrativeGraph.
//   * Provider rate-limit helpers.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/signals/persistence.ts).
//
// AUTHZ MODEL (migration 0012 RLS, mirrored here for clean DbResult errors):
//   * OPERATIONAL tables (job queue/attempts, scheduler rules, capture dedupes,
//     provider accounts/rate limits, triage rules, SLA policies): reviewer+ READ;
//     curator/admin WRITE. We gate writes at curator in the DAL; RLS is the
//     backstop. Reads go through the RLS client (reviewer+ see rows).
//   * GRAPH tables (entities/narratives/edges/links): any authenticated user
//     READS; researcher+ WRITES. We gate graph writes at researcher.
//   No service-role path here — app actions are RLS-scoped (defence in depth).
//
// DESIGN: every function returns DbResult<T> and NEVER throws. Empty Supabase
// env degrades gracefully (NOT_CONFIGURED) so `next build` passes.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  CronParseError,
  nextRunAfter,
} from '@hsi/scheduler';
import {
  DEFAULT_SLA_POLICIES,
  DEFAULT_TRIAGE_RULES,
  type NarrativeGraph,
} from '@hsi/source-intelligence';
import type {
  AppRole,
  HsinEntityRecord,
  HsinJobAttemptRecord,
  HsinJobQueueRecord,
  HsinNarrativeEdgeRecord,
  HsinNarrativeRecord,
  HsinProviderRateLimitRecord,
  HsinSchedulerRuleRecord,
  HsinSignalEntityRecord,
  HsinSignalNarrativeRecord,
  HsinSlaPolicyRecord,
  HsinTriageRuleRecord,
  JobStatus,
  JobWithAttempts,
  NarrativeEdgeType,
  NarrativeGraphData,
  OperationsOverview,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6/7/8).
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
  logError('operations/persistence', error);
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
  return {
    ok: false,
    error: `${what} not found or not visible.`,
    code: 'DB_ERROR',
  };
}

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/signals/persistence.ts).
// -----------------------------------------------------------------------------

/** Per-request, cookie-backed, RLS-enforced client for reads AND writes. */
function db(): SupabaseClient {
  return createClient();
}

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

async function sessionRole(client: SupabaseClient): Promise<AppRole | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data } = await client
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (data?.role as string | undefined) ?? 'viewer';
  return (role in ROLE_LEVEL ? role : 'viewer') as AppRole;
}

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

/** YYYY-MM-DD bucket from an ISO timestamp (for per-day throughput series). */
function dayBucket(iso?: string | null): string {
  if (!iso) return 'unknown';
  return iso.slice(0, 10);
}

/** Build a sorted per-day {date,count} series from a list of ISO timestamps. */
function perDay(rows: Array<{ created_at?: string | null }>): {
  date: string;
  count: number;
}[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = dayBucket(r.created_at);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

// =============================================================================
// OPERATIONS
// =============================================================================

/**
 * Assemble the operations console aggregate. Best-effort across the board (each
 * block degrades to its default on its own error). Reviewer+ can see the queue
 * (RLS); for unauthorized/anon callers the counts read as zero (RLS hides rows).
 */
export async function getOperationsOverview(): Promise<
  DbResult<OperationsOverview>
> {
  try {
    const client = db();

    // Job-queue counts by status.
    async function statusCount(status: JobStatus): Promise<number> {
      const { count } = await client
        .from('hsin_job_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      return count ?? 0;
    }
    const [queued, running, failed, retrying] = await Promise.all([
      statusCount('queued'),
      statusCount('running'),
      statusCount('failed'),
      statusCount('retrying'),
    ]);

    // Completed in the last 24h.
    let completed24h = 0;
    {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await client
        .from('hsin_job_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('finished_at', since);
      completed24h = count ?? 0;
    }

    // Recent attempts.
    let recentAttempts: HsinJobAttemptRecord[] = [];
    {
      const { data } = await client
        .from('hsin_job_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);
      recentAttempts = (data ?? []) as HsinJobAttemptRecord[];
    }

    // Source health summary: latest-per-source status -> count.
    const sourceHealthSummary: Record<string, number> = {};
    {
      const { data } = await client
        .from('hsin_source_health')
        .select('source_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);
      const seen = new Set<string>();
      for (const r of (data ?? []) as Array<{
        source_id: string;
        status?: string;
      }>) {
        if (seen.has(r.source_id)) continue;
        seen.add(r.source_id);
        const status = r.status ?? 'unknown';
        sourceHealthSummary[status] = (sourceHealthSummary[status] ?? 0) + 1;
      }
    }

    // Provider rate limits.
    let providerRateLimits: HsinProviderRateLimitRecord[] = [];
    {
      const { data } = await client
        .from('hsin_provider_rate_limits')
        .select('*')
        .order('provider_name', { ascending: true });
      providerRateLimits = (data ?? []) as HsinProviderRateLimitRecord[];
    }

    // Scheduler rules.
    let schedulerRules: HsinSchedulerRuleRecord[] = [];
    {
      const { data } = await client
        .from('hsin_scheduler_rules')
        .select('*')
        .order('created_at', { ascending: false });
      schedulerRules = (data ?? []) as HsinSchedulerRuleRecord[];
    }

    // Capture throughput: signals captured per day (recent window).
    let captureThroughput: { date: string; count: number }[] = [];
    {
      const { data } = await client
        .from('hsin_signals')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      captureThroughput = perDay((data ?? []) as Array<{ created_at: string }>);
    }

    // Alert throughput: alerts raised per day (recent window).
    let alertThroughput: { date: string; count: number }[] = [];
    {
      const { data } = await client
        .from('hsin_signal_alerts')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      alertThroughput = perDay((data ?? []) as Array<{ created_at: string }>);
    }

    return {
      ok: true,
      data: {
        queued,
        running,
        failed,
        retrying,
        completed24h,
        recentAttempts,
        sourceHealthSummary,
        providerRateLimits,
        schedulerRules,
        captureThroughput,
        alertThroughput,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export interface JobFilters {
  status?: JobStatus;
  jobType?: string;
  sourceId?: string;
}

/** List jobs (filtered), newest first. RLS: reviewer+ see rows. */
export async function listJobs(
  filters?: JobFilters,
): Promise<DbResult<HsinJobQueueRecord[]>> {
  try {
    const client = db();
    let query = client.from('hsin_job_queue').select('*');
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.jobType) query = query.eq('job_type', filters.jobType);
    if (filters?.sourceId) query = query.eq('source_id', filters.sourceId);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinJobQueueRecord[] };
  } catch (e) {
    return fail(e);
  }
}

/** Load one job with its full attempt history. */
export async function getJob(id: string): Promise<DbResult<JobWithAttempts>> {
  try {
    const client = db();
    const { data: jobRow, error } = await client
      .from('hsin_job_queue')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return fail(error);
    if (!jobRow) return notFound('Job');

    const { data: attemptRows } = await client
      .from('hsin_job_attempts')
      .select('*')
      .eq('job_id', id)
      .order('attempt_number', { ascending: true });

    return {
      ok: true,
      data: {
        job: jobRow as HsinJobQueueRecord,
        attempts: (attemptRows ?? []) as HsinJobAttemptRecord[],
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Re-queue a job (curator+): status='queued', scheduled_for=now, clear error. */
export async function retryJob(
  id: string,
): Promise<DbResult<HsinJobQueueRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const now = new Date().toISOString();
    const { data, error } = await client
      .from('hsin_job_queue')
      .update({
        status: 'queued',
        scheduled_for: now,
        error_message: null,
        started_at: null,
        finished_at: null,
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinJobQueueRecord };
  } catch (e) {
    return fail(e);
  }
}

/** Cancel a job (curator+): status='cancelled', finished_at=now. */
export async function cancelJob(
  id: string,
): Promise<DbResult<HsinJobQueueRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('hsin_job_queue')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinJobQueueRecord };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// SCHEDULER RULES
// =============================================================================

/** List scheduler rules, newest first. RLS: reviewer+ see rows. */
export async function listSchedulerRules(): Promise<
  DbResult<HsinSchedulerRuleRecord[]>
> {
  try {
    const { data, error } = await db()
      .from('hsin_scheduler_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinSchedulerRuleRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export interface CreateSchedulerRuleInput {
  sourceId?: string;
  jobType: string;
  cronExpression: string;
  enabled?: boolean;
}

/**
 * Create a scheduler rule (curator+). Validates the cron expression via the pure
 * scheduler parser (nextRunAfter) before persisting and stamps next_run_at from
 * the same computation. A bad cron yields a readable DB_ERROR (never throws).
 */
export async function createSchedulerRule(
  input: CreateSchedulerRuleInput,
): Promise<DbResult<HsinSchedulerRuleRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    if (!input.jobType || !input.cronExpression) {
      return {
        ok: false,
        error: 'A job type and cron expression are required.',
        code: 'DB_ERROR',
      };
    }

    // Validate cron + compute the first next_run_at.
    const now = new Date().toISOString();
    let nextRunAt: string;
    try {
      nextRunAt = nextRunAfter(input.cronExpression, now);
    } catch (cronErr) {
      const msg =
        cronErr instanceof CronParseError
          ? cronErr.message
          : cronErr instanceof Error
            ? cronErr.message
            : 'invalid cron expression';
      return {
        ok: false,
        error: `Invalid cron expression: ${msg}`,
        code: 'DB_ERROR',
      };
    }

    const { data, error } = await client
      .from('hsin_scheduler_rules')
      .insert({
        source_id: input.sourceId ?? null,
        job_type: input.jobType,
        cron_expression: input.cronExpression,
        enabled: input.enabled ?? true,
        next_run_at: nextRunAt,
        created_by: gate.user.id,
      })
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinSchedulerRuleRecord };
  } catch (e) {
    return fail(e);
  }
}

/** Enable/disable a scheduler rule (curator+). */
export async function toggleSchedulerRule(
  id: string,
  enabled: boolean,
): Promise<DbResult<HsinSchedulerRuleRecord>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { data, error } = await client
      .from('hsin_scheduler_rules')
      .update({ enabled })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    return { ok: true, data: data as HsinSchedulerRuleRecord };
  } catch (e) {
    return fail(e);
  }
}

/** Delete a scheduler rule (curator+). */
export async function deleteSchedulerRule(
  id: string,
): Promise<DbResult<{ id: string }>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'curator');
    if (!gate.ok) return gate;

    const { error } = await client
      .from('hsin_scheduler_rules')
      .delete()
      .eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// TRIAGE / SLA
// =============================================================================

/**
 * List triage rules: the engine DEFAULT_TRIAGE_RULES surfaced as records, merged
 * with any stored hsin_triage_rules (stored rows with the same name override the
 * default). We DO NOT seed defaults into the table — they are presented in-memory
 * so an empty-env / fresh deployment still shows the active rule set.
 */
export async function listTriageRules(): Promise<
  DbResult<HsinTriageRuleRecord[]>
> {
  try {
    const client = db();

    // Defaults as records (synthetic ids/timestamps; clearly engine-provided).
    const now = new Date(0).toISOString();
    const defaults: HsinTriageRuleRecord[] = DEFAULT_TRIAGE_RULES.map((r) => ({
      id: `default:${r.id}`,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      conditions_json: r.conditions as unknown as JsonRecord[],
      actions_json: r.actions as unknown as JsonRecord[],
      created_at: now,
      updated_at: now,
    }));

    let stored: HsinTriageRuleRecord[] = [];
    {
      const { data, error } = await client
        .from('hsin_triage_rules')
        .select('*')
        .order('created_at', { ascending: false });
      // Missing table / RLS should not break the defaults-only view.
      if (!error) stored = (data ?? []) as HsinTriageRuleRecord[];
    }

    // Merge: stored-by-name overrides the default of the same name.
    const byName = new Map<string, HsinTriageRuleRecord>();
    for (const d of defaults) byName.set(d.name, d);
    for (const s of stored) byName.set(s.name, s);

    return { ok: true, data: Array.from(byName.values()) };
  } catch (e) {
    return fail(e);
  }
}

/**
 * List SLA policies: stored hsin_sla_policies, falling back to the engine
 * DEFAULT_SLA_POLICIES when the table is empty/unavailable.
 */
export async function listSlaPolicies(): Promise<
  DbResult<HsinSlaPolicyRecord[]>
> {
  try {
    const client = db();
    const { data, error } = await client
      .from('hsin_sla_policies')
      .select('*')
      .order('review_deadline_hours', { ascending: true });

    if (!error && data && data.length > 0) {
      return { ok: true, data: data as HsinSlaPolicyRecord[] };
    }

    // Fallback: engine defaults as records.
    const now = new Date(0).toISOString();
    const defaults: HsinSlaPolicyRecord[] = DEFAULT_SLA_POLICIES.map((p) => ({
      id: `default:${p.severity}`,
      name: p.name,
      severity: p.severity,
      review_deadline_hours: p.reviewDeadlineHours,
      escalation_deadline_hours: p.escalationDeadlineHours,
      created_at: now,
      updated_at: now,
    }));
    return { ok: true, data: defaults };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// NARRATIVE GRAPH
// =============================================================================

export interface NarrativeGraphFilters {
  from?: string;
  to?: string;
  category?: string;
}

/**
 * Load the narrative/entity knowledge graph (RLS: any authenticated user reads).
 * Narratives can be filtered by created_at window + category; entities/edges/
 * links are loaded scoped to the visible narratives (or globally when unfiltered).
 */
export async function getNarrativeGraph(
  filters?: NarrativeGraphFilters,
): Promise<DbResult<NarrativeGraphData>> {
  try {
    const client = db();

    let nq = client.from('hsin_narratives').select('*');
    if (filters?.category) nq = nq.eq('category', filters.category);
    if (filters?.from) nq = nq.gte('created_at', filters.from);
    if (filters?.to) nq = nq.lte('created_at', filters.to);
    const { data: narrativeRows, error: nerr } = await nq
      .order('created_at', { ascending: false })
      .limit(500);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    // Entities (full catalog — entities aren't directly scoped by narrative).
    const { data: entityRows } = await client
      .from('hsin_entities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    const entities = (entityRows ?? []) as HsinEntityRecord[];

    const narrativeIds = narratives.map((n) => n.id);

    // Edges between the visible narratives.
    let edges: HsinNarrativeEdgeRecord[] = [];
    let signalNarratives: HsinSignalNarrativeRecord[] = [];
    if (narrativeIds.length > 0) {
      const { data: edgeRows } = await client
        .from('hsin_narrative_edges')
        .select('*')
        .in('source_narrative_id', narrativeIds)
        .limit(2000);
      edges = (edgeRows ?? []) as HsinNarrativeEdgeRecord[];

      const { data: snRows } = await client
        .from('hsin_signal_narratives')
        .select('*')
        .in('narrative_id', narrativeIds)
        .limit(5000);
      signalNarratives = (snRows ?? []) as HsinSignalNarrativeRecord[];
    }

    // Signal<->entity links scoped to signals that appear in the narrative links.
    let signalEntities: HsinSignalEntityRecord[] = [];
    {
      const signalIds = Array.from(
        new Set(signalNarratives.map((s) => s.signal_id)),
      );
      if (signalIds.length > 0) {
        const { data: seRows } = await client
          .from('hsin_signal_entities')
          .select('*')
          .in('signal_id', signalIds)
          .limit(5000);
        signalEntities = (seRows ?? []) as HsinSignalEntityRecord[];
      } else if (!filters || (!filters.from && !filters.to && !filters.category)) {
        // Unfiltered view: include a recent slice of all signal<->entity links.
        const { data: seRows } = await client
          .from('hsin_signal_entities')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000);
        signalEntities = (seRows ?? []) as HsinSignalEntityRecord[];
      }
    }

    return {
      ok: true,
      data: { narratives, entities, edges, signalNarratives, signalEntities },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Map an engine ExtractedEntity.entityType to the DB entity_type column. */
function asEntityType(t: string): HsinEntityRecord['entity_type'] {
  const allowed: HsinEntityRecord['entity_type'][] = [
    'person',
    'organization',
    'movement',
    'ideology',
    'topic',
    'place',
    'platform',
    'publication',
    'unknown',
  ];
  return (allowed as string[]).includes(t)
    ? (t as HsinEntityRecord['entity_type'])
    : 'unknown';
}

/** Map an engine NarrativeEdge.edgeType to the DB edge_type column. */
function asEdgeType(t: string): NarrativeEdgeType {
  const allowed: NarrativeEdgeType[] = [
    'related_to',
    'contradicts',
    'amplifies',
    'evolves_into',
    'derived_from',
    'co_occurs_with',
  ];
  return (allowed as string[]).includes(t) ? (t as NarrativeEdgeType) : 'related_to';
}

/** Clamp the engine's 0..1 node risk into the DB's 1..5 integer risk_level. */
function toDbRiskLevel(risk?: number): number | null {
  if (typeof risk !== 'number' || Number.isNaN(risk)) return null;
  const scaled = Math.round(risk * 5);
  return Math.min(5, Math.max(1, scaled));
}

/**
 * Persist a source-intelligence NarrativeGraph (researcher+). Upserts entities
 * (unique name+type), narratives (by name), narrative edges (by node mapping),
 * and the signal<->narrative / signal<->entity links the graph carries.
 *
 * The engine NarrativeNode.id is a transient cluster id; we map it to the durable
 * hsin_narratives.id and rewrite edges/links accordingly. Best-effort per row —
 * a single failed upsert never aborts the whole persist. NEVER throws.
 *
 * Returns counts of rows written (for the action to report + revalidate).
 */
export async function persistNarrativeGraph(
  graph: NarrativeGraph,
): Promise<
  DbResult<{
    narratives: number;
    entities: number;
    edges: number;
    signalNarratives: number;
    signalEntities: number;
  }>
> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    let narrativesWritten = 0;
    let entitiesWritten = 0;
    let edgesWritten = 0;
    let signalNarrativesWritten = 0;
    let signalEntitiesWritten = 0;

    // 1. Narratives — upsert by name (find existing, else insert). Map the
    //    transient node id -> durable narrative id.
    const nodeIdToNarrativeId = new Map<string, string>();
    for (const node of graph.nodes) {
      let narrativeId: string | null = null;
      const { data: existing } = await client
        .from('hsin_narratives')
        .select('id')
        .eq('name', node.name)
        .maybeSingle();
      if (existing?.id) {
        narrativeId = existing.id as string;
        await client
          .from('hsin_narratives')
          .update({
            description: node.description ?? null,
            category: node.category ?? null,
            risk_level: toDbRiskLevel(node.riskLevel),
          })
          .eq('id', narrativeId)
          .then(() => undefined, () => undefined);
      } else {
        const { data: inserted } = await client
          .from('hsin_narratives')
          .insert({
            name: node.name,
            description: node.description ?? null,
            category: node.category ?? null,
            risk_level: toDbRiskLevel(node.riskLevel),
            created_by: gate.user.id,
          })
          .select('id')
          .single();
        narrativeId = (inserted?.id as string | undefined) ?? null;
        if (narrativeId) narrativesWritten += 1;
      }
      if (narrativeId) nodeIdToNarrativeId.set(node.id, narrativeId);
    }

    // 2. Entities — upsert by (name, entity_type). Map name(lower) -> entity id.
    const entityKeyToId = new Map<string, string>();
    for (const e of graph.entities) {
      const entityType = asEntityType(e.entityType);
      const key = `${e.name.toLowerCase()}::${entityType}`;
      const { data: existing } = await client
        .from('hsin_entities')
        .select('id')
        .eq('name', e.name)
        .eq('entity_type', entityType)
        .maybeSingle();
      if (existing?.id) {
        entityKeyToId.set(key, existing.id as string);
      } else {
        const { data: inserted } = await client
          .from('hsin_entities')
          .insert({
            name: e.name,
            entity_type: entityType,
            description: e.evidenceText ?? null,
          })
          .select('id')
          .single();
        const id = inserted?.id as string | undefined;
        if (id) {
          entityKeyToId.set(key, id);
          entitiesWritten += 1;
        }
      }
    }

    // 3. Narrative edges — map node ids to durable narrative ids, then insert.
    for (const edge of graph.edges) {
      const src = nodeIdToNarrativeId.get(edge.sourceNarrativeId);
      const tgt = nodeIdToNarrativeId.get(edge.targetNarrativeId);
      if (!src || !tgt || src === tgt) continue;
      const { error } = await client.from('hsin_narrative_edges').insert({
        source_narrative_id: src,
        target_narrative_id: tgt,
        edge_type: asEdgeType(edge.edgeType),
        weight: edge.weight,
        rationale: edge.rationale,
      });
      if (!error) edgesWritten += 1;
    }

    // 4. Signal<->narrative links from each node's signalIds.
    for (const node of graph.nodes) {
      const narrativeId = nodeIdToNarrativeId.get(node.id);
      if (!narrativeId) continue;
      const size = node.signalIds.length;
      for (const signalId of node.signalIds) {
        const confidence = Math.min(0.95, 0.5 + (size > 1 ? 0.2 : 0));
        const { error } = await client.from('hsin_signal_narratives').insert({
          signal_id: signalId,
          narrative_id: narrativeId,
          confidence,
          rationale:
            `Signal clustered into narrative "${node.name}" ` +
            `(${size} signal(s)${node.category ? `, category ${node.category}` : ''}).`,
        });
        if (!error) signalNarrativesWritten += 1;
      }
    }

    // 5. Signal<->entity links: associate each entity with every signal in the
    //    graph (the graph aggregates entities across all signals — we link them
    //    to the narratives' signals so the graph UI can draw signal→entity).
    if (entityKeyToId.size > 0) {
      const allSignalIds = Array.from(
        new Set(graph.nodes.flatMap((n) => n.signalIds)),
      );
      for (const e of graph.entities) {
        const entityType = asEntityType(e.entityType);
        const key = `${e.name.toLowerCase()}::${entityType}`;
        const entityId = entityKeyToId.get(key);
        if (!entityId) continue;
        for (const signalId of allSignalIds) {
          const { error } = await client
            .from('hsin_signal_entities')
            .insert({
              signal_id: signalId,
              entity_id: entityId,
              confidence: e.confidence,
              evidence_text: e.evidenceText ?? null,
            });
          if (!error) signalEntitiesWritten += 1;
        }
      }
    }

    return {
      ok: true,
      data: {
        narratives: narrativesWritten,
        entities: entitiesWritten,
        edges: edgesWritten,
        signalNarratives: signalNarrativesWritten,
        signalEntities: signalEntitiesWritten,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// PROVIDER RATE LIMITS
// =============================================================================

/** List provider rate-limit windows. RLS: reviewer+ see rows. */
export async function getProviderRateLimits(): Promise<
  DbResult<HsinProviderRateLimitRecord[]>
> {
  try {
    const { data, error } = await db()
      .from('hsin_provider_rate_limits')
      .select('*')
      .order('provider_name', { ascending: true });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []) as HsinProviderRateLimitRecord[] };
  } catch (e) {
    return fail(e);
  }
}

export interface ProviderRateLimitInput {
  providerName: string;
  windowSeconds?: number;
  maxRequests?: number;
  remainingRequests?: number;
  resetAt?: string;
}

/** Upsert a provider rate-limit window (curator+). Unique by provider_name. */
export async function upsertProviderRateLimit(
  input: ProviderRateLimitInput,
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

    // Update existing-by-name; insert if absent (supabase-js upsert needs the
    // unique target — we keep it explicit to stay robust).
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

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the pipeline.
// -----------------------------------------------------------------------------
export { db as operationsDbClient, requireRole as requireOperationsRole };
