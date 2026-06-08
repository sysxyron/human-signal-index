// =============================================================================
// HSIN Phase 10 — Temporal Intelligence data-access layer (DAL). SERVER-ONLY.
//
// "Git history for ideas." The persistence layer for the Phase-10 temporal layer
// over the narrative-intelligence graph (migration 0014):
//   * SNAPSHOTS  — hsin_narrative_snapshots: point-in-time metrics for a narrative.
//   * EVOLUTION  — hsin_narrative_evolution: typed change between two snapshots.
//   * GENEALOGY  — hsin_narrative_genealogy: typed lineage edge between narratives.
//   * INFLUENCE  — hsin_narrative_influence: directed influence score between
//     narratives.
//   * FORECASTS  — hsin_narrative_forecasts: probabilistic trajectory forecast.
//
// The PURE, deterministic engine lives in '@hsi/temporal-intelligence'. This DAL
// reads the Phase-8/9 graph (narratives + signals + amplification + reliability +
// communities), feeds it to the engine, and persists the results. Reads assemble
// the Phase-10 view-models the WorldForge temporal consoles render; the
// NarrativeHistory bundle is the WorldForge fusion-bridge adapter.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/operations/persistence.ts).
//
// AUTHZ MODEL (migration 0014 RLS, mirrored here for clean DbResult errors):
//   * All 5 Phase-10 tables are part of the SHARED narrative-intelligence graph:
//       authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
//   * We gate the rebuild at researcher (RLS is the backstop). Reads go through the
//     RLS client (any authenticated user sees rows). NO service-role path here —
//     the background temporal worker uses service_role; the app is RLS-scoped.
//
// DESIGN: every function returns DbResult<T> and NEVER throws. Empty Supabase
// env degrades gracefully (NOT_CONFIGURED) so `next build` passes. The rebuild
// wraps each stage so a partial failure still persists what it can.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  buildInfluenceNetwork,
  buildNarrativeGenealogy,
  captureSnapshots,
  evolutionSeries,
  forecastNarrativeTrajectory,
  temporalDemo,
  type EvolutionRecord,
  type GenealogyEdge,
  type InfluenceEdge,
  type NarrativeForecast,
  type NarrativeInput,
  type NarrativeSnapshot,
  type SignalInput,
} from '@hsi/temporal-intelligence';
import { createEmbedder } from '@hsi/source-intelligence';
import type {
  AppRole,
  EvolutionView,
  ForecastView,
  GenealogyView,
  HsinNarrativeEvolutionRecord,
  HsinNarrativeForecastRecord,
  HsinNarrativeGenealogyRecord,
  HsinNarrativeInfluenceRecord,
  HsinNarrativeRecord,
  HsinNarrativeSnapshotRecord,
  InfluenceView,
  NarrativeChangeType,
  NarrativeForecastState,
  NarrativeGenealogyRelationship,
  NarrativeHistory,
  TemporalHighlights,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6/7/8/9).
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

export function fail(error: unknown): {
  ok: false;
  error: string;
  code: DbResultCode;
} {
  logError('temporal/persistence', error);
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

export function forbidden(required: AppRole): {
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

// -----------------------------------------------------------------------------
// Client + identity + role helpers (mirror lib/operations/persistence.ts).
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
export type JsonRecord = Record<string, unknown>;

/** Cast an arbitrary engine value into the jsonb record shape (never `any`). */
function toJson(value: unknown): JsonRecord {
  return (value ?? {}) as JsonRecord;
}

// -----------------------------------------------------------------------------
// Engine union → DB union mappers. The engine + DB use identical string sets;
// these guards keep the persisted value inside the migration-0014 CHECK domain.
// -----------------------------------------------------------------------------
function asChangeType(t: string): NarrativeChangeType {
  const allowed: NarrativeChangeType[] = [
    'growth',
    'decline',
    'mutation',
    'split',
    'merge',
  ];
  return (allowed as string[]).includes(t) ? (t as NarrativeChangeType) : 'growth';
}

function asRelationship(t: string): NarrativeGenealogyRelationship {
  const allowed: NarrativeGenealogyRelationship[] = [
    'derived_from',
    'split_from',
    'merged_from',
    'contradicts',
    'amplifies',
  ];
  return (allowed as string[]).includes(t)
    ? (t as NarrativeGenealogyRelationship)
    : 'derived_from';
}

function asForecastState(t: string): NarrativeForecastState {
  const allowed: NarrativeForecastState[] = [
    'emerging',
    'rising',
    'stable',
    'declining',
    'dead',
  ];
  return (allowed as string[]).includes(t)
    ? (t as NarrativeForecastState)
    : 'stable';
}

// =============================================================================
// READS (authenticated — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

export interface EvolutionFilters {
  narrativeId?: string;
  from?: string;
  to?: string;
}

/**
 * Evolution view: visible narratives + their snapshots + the typed changes between
 * consecutive snapshots. `narrativeId` scopes to a single narrative; `from`/`to`
 * window the evolution records by created_at. RLS: any authenticated user reads.
 * NEVER throws.
 */
export async function getEvolution(
  filters?: EvolutionFilters,
): Promise<DbResult<EvolutionView>> {
  try {
    const client = db();

    // Narratives (scoped to one when filtered).
    let nq = client.from('hsin_narratives').select('*');
    if (filters?.narrativeId) nq = nq.eq('id', filters.narrativeId);
    const { data: narrativeRows, error: nerr } = await nq
      .order('created_at', { ascending: false })
      .limit(1000);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    // Snapshots (scoped to the narrative when filtered).
    let sq = client.from('hsin_narrative_snapshots').select('*');
    if (filters?.narrativeId) sq = sq.eq('narrative_id', filters.narrativeId);
    const { data: snapRows, error: serr } = await sq
      .order('captured_at', { ascending: true })
      .limit(5000);
    if (serr) return fail(serr);
    const snapshots = (snapRows ?? []) as HsinNarrativeSnapshotRecord[];

    // Evolution (scoped to the narrative + windowed by created_at when filtered).
    let eq = client.from('hsin_narrative_evolution').select('*');
    if (filters?.narrativeId) eq = eq.eq('narrative_id', filters.narrativeId);
    if (filters?.from) eq = eq.gte('created_at', filters.from);
    if (filters?.to) eq = eq.lte('created_at', filters.to);
    const { data: evoRows, error: eerr } = await eq
      .order('created_at', { ascending: true })
      .limit(5000);
    if (eerr) return fail(eerr);
    const evolution = (evoRows ?? []) as HsinNarrativeEvolutionRecord[];

    return { ok: true, data: { narratives, snapshots, evolution } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Genealogy view: visible narratives + their typed lineage edges. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getGenealogy(): Promise<DbResult<GenealogyView>> {
  try {
    const client = db();

    const { data: narrativeRows } = await client
      .from('hsin_narratives')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    const { data: edgeRows, error } = await client
      .from('hsin_narrative_genealogy')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) return fail(error);
    const edges = (edgeRows ?? []) as HsinNarrativeGenealogyRecord[];

    return { ok: true, data: { narratives, edges } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Influence view: visible narratives + their directed influence edges (strongest
 * first). RLS: any authenticated user reads. NEVER throws.
 */
export async function getInfluence(): Promise<DbResult<InfluenceView>> {
  try {
    const client = db();

    const { data: narrativeRows } = await client
      .from('hsin_narratives')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    const { data: edgeRows, error } = await client
      .from('hsin_narrative_influence')
      .select('*')
      .order('influence_score', { ascending: false })
      .limit(5000);
    if (error) return fail(error);
    const edges = (edgeRows ?? []) as HsinNarrativeInfluenceRecord[];

    return { ok: true, data: { narratives, edges } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Forecast view: visible narratives + the LATEST forecast per narrative. The
 * forecast table is append-per-run (generated_at stamps each run); we keep only
 * the newest forecast for each narrative. RLS: any authenticated user reads.
 * NEVER throws.
 */
export async function getForecast(): Promise<DbResult<ForecastView>> {
  try {
    const client = db();

    const { data: narrativeRows } = await client
      .from('hsin_narratives')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    // Newest-first; reduce to the latest forecast per narrative.
    const { data: forecastRows, error } = await client
      .from('hsin_narrative_forecasts')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(5000);
    if (error) return fail(error);
    const all = (forecastRows ?? []) as HsinNarrativeForecastRecord[];

    const latestByNarrative = new Map<string, HsinNarrativeForecastRecord>();
    for (const f of all) {
      const key = f.narrative_id ?? f.id;
      if (!latestByNarrative.has(key)) latestByNarrative.set(key, f);
    }
    const forecasts = Array.from(latestByNarrative.values());

    return { ok: true, data: { narratives, forecasts } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Derive the headline temporal callouts for the dashboard:
 *   * fastestGrowing            — latest evolution row with the max growth_pct;
 *   * largestCommunityExpansion — latest evolution row with the max metrics_json
 *                                 communityDelta;
 *   * largestAmplificationSpike — latest evolution row with the max metrics_json
 *                                 amplificationDelta;
 *   * mostInfluential           — narrative with the highest influence_score;
 *   * newestEmerging            — forecast_type='emerging' ordered by probability.
 * Best-effort: each callout degrades to undefined on missing data. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getTemporalHighlights(): Promise<
  DbResult<TemporalHighlights>
> {
  try {
    const client = db();

    // Narrative name lookup (for human-readable callouts).
    const { data: narrativeRows } = await client
      .from('hsin_narratives')
      .select('id, name')
      .limit(2000);
    const nameById = new Map<string, string>();
    for (const n of (narrativeRows ?? []) as Array<{ id: string; name: string }>) {
      nameById.set(n.id, n.name);
    }
    const nameOf = (id?: string): string =>
      (id && nameById.get(id)) || id || 'unknown';

    const highlights: TemporalHighlights = {};

    // ---- Evolution-derived callouts (growth / community / amplification) -----
    {
      const { data: evoRows } = await client
        .from('hsin_narrative_evolution')
        .select('narrative_id, growth_pct, metrics_json, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);
      const rows = (evoRows ?? []) as Array<{
        narrative_id?: string;
        growth_pct?: number;
        metrics_json?: JsonRecord;
      }>;

      // Keep the LATEST evolution row per narrative (rows are newest-first).
      const latest = new Map<
        string,
        { narrative_id?: string; growth_pct?: number; metrics_json?: JsonRecord }
      >();
      for (const r of rows) {
        const key = r.narrative_id ?? '';
        if (key && !latest.has(key)) latest.set(key, r);
      }

      let bestGrowth: { id: string; v: number } | null = null;
      let bestCommunity: { id: string; v: number } | null = null;
      let bestAmp: { id: string; v: number } | null = null;
      for (const [id, r] of latest) {
        const growth = typeof r.growth_pct === 'number' ? r.growth_pct : undefined;
        if (growth !== undefined && (!bestGrowth || growth > bestGrowth.v)) {
          bestGrowth = { id, v: growth };
        }
        const m = r.metrics_json ?? {};
        const community =
          typeof m.communityDelta === 'number' ? m.communityDelta : undefined;
        if (
          community !== undefined &&
          (!bestCommunity || community > bestCommunity.v)
        ) {
          bestCommunity = { id, v: community };
        }
        const amp =
          typeof m.amplificationDelta === 'number'
            ? m.amplificationDelta
            : undefined;
        if (amp !== undefined && (!bestAmp || amp > bestAmp.v)) {
          bestAmp = { id, v: amp };
        }
      }

      if (bestGrowth) {
        highlights.fastestGrowing = {
          narrativeId: bestGrowth.id,
          name: nameOf(bestGrowth.id),
          growthPct: bestGrowth.v,
        };
      }
      if (bestCommunity) {
        highlights.largestCommunityExpansion = {
          narrativeId: bestCommunity.id,
          name: nameOf(bestCommunity.id),
          communityDelta: bestCommunity.v,
        };
      }
      if (bestAmp) {
        highlights.largestAmplificationSpike = {
          narrativeId: bestAmp.id,
          name: nameOf(bestAmp.id),
          amplificationDelta: bestAmp.v,
        };
      }
    }

    // ---- Most influential (max influence_score over the network) -------------
    {
      const { data: infRows } = await client
        .from('hsin_narrative_influence')
        .select('source_narrative_id, influence_score')
        .order('influence_score', { ascending: false })
        .limit(1);
      const top = ((infRows ?? []) as Array<{
        source_narrative_id?: string;
        influence_score?: number;
      }>)[0];
      if (top && typeof top.influence_score === 'number') {
        highlights.mostInfluential = {
          narrativeId: top.source_narrative_id ?? 'unknown',
          name: nameOf(top.source_narrative_id),
          influenceScore: top.influence_score,
        };
      }
    }

    // ---- Newest emerging (forecast_type='emerging', max probability) ---------
    {
      const { data: fcRows } = await client
        .from('hsin_narrative_forecasts')
        .select('narrative_id, probability, generated_at')
        .eq('forecast_type', 'emerging')
        .order('probability', { ascending: false })
        .limit(1);
      const top = ((fcRows ?? []) as Array<{
        narrative_id?: string;
        probability?: number;
      }>)[0];
      if (top && typeof top.probability === 'number') {
        highlights.newestEmerging = {
          narrativeId: top.narrative_id ?? 'unknown',
          name: nameOf(top.narrative_id),
          probability: top.probability,
        };
      }
    }

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

/**
 * The full temporal history bundle for ONE narrative — the WorldForge fusion-bridge
 * adapter. Assembles its snapshots + evolution + genealogy edges (as parent OR
 * child) + influence edges (as source OR target) + the latest forecast. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getNarrativeHistory(
  narrativeId: string,
): Promise<DbResult<NarrativeHistory>> {
  try {
    const client = db();

    const { data: snapRows, error: serr } = await client
      .from('hsin_narrative_snapshots')
      .select('*')
      .eq('narrative_id', narrativeId)
      .order('captured_at', { ascending: true })
      .limit(2000);
    if (serr) return fail(serr);
    const snapshots = (snapRows ?? []) as HsinNarrativeSnapshotRecord[];

    const { data: evoRows } = await client
      .from('hsin_narrative_evolution')
      .select('*')
      .eq('narrative_id', narrativeId)
      .order('created_at', { ascending: true })
      .limit(2000);
    const evolution = (evoRows ?? []) as HsinNarrativeEvolutionRecord[];

    // Genealogy edges where this narrative is the parent OR the child.
    const genealogy: HsinNarrativeGenealogyRecord[] = [];
    {
      const { data: asParent } = await client
        .from('hsin_narrative_genealogy')
        .select('*')
        .eq('parent_narrative_id', narrativeId)
        .limit(2000);
      const { data: asChild } = await client
        .from('hsin_narrative_genealogy')
        .select('*')
        .eq('child_narrative_id', narrativeId)
        .limit(2000);
      const seen = new Set<string>();
      for (const e of [
        ...((asParent ?? []) as HsinNarrativeGenealogyRecord[]),
        ...((asChild ?? []) as HsinNarrativeGenealogyRecord[]),
      ]) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        genealogy.push(e);
      }
    }

    // Influence edges where this narrative is the source OR the target.
    const influence: HsinNarrativeInfluenceRecord[] = [];
    {
      const { data: asSource } = await client
        .from('hsin_narrative_influence')
        .select('*')
        .eq('source_narrative_id', narrativeId)
        .limit(2000);
      const { data: asTarget } = await client
        .from('hsin_narrative_influence')
        .select('*')
        .eq('target_narrative_id', narrativeId)
        .limit(2000);
      const seen = new Set<string>();
      for (const e of [
        ...((asSource ?? []) as HsinNarrativeInfluenceRecord[]),
        ...((asTarget ?? []) as HsinNarrativeInfluenceRecord[]),
      ]) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        influence.push(e);
      }
    }

    // Latest forecast for the narrative.
    const { data: fcRows } = await client
      .from('hsin_narrative_forecasts')
      .select('*')
      .eq('narrative_id', narrativeId)
      .order('generated_at', { ascending: false })
      .limit(1);
    const forecast = ((fcRows ?? []) as HsinNarrativeForecastRecord[])[0];

    return {
      ok: true,
      data: {
        narrativeId,
        snapshots,
        evolution,
        genealogy,
        influence,
        forecast,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// REBUILD (researcher+) — the END-TO-END compute + persist chain.
// =============================================================================

export interface RebuildTemporalSummary {
  snapshots: number;
  evolution: number;
  genealogy: number;
  influence: number;
  forecasts: number;
}

// Minimal row projections (keep `any` out of signatures).
interface NarrativeRow {
  id: string;
  name: string;
  category?: string | null;
  created_at?: string | null;
}
interface SignalRow {
  id: string;
  source_id?: string | null;
  captured_at?: string | null;
  title?: string | null;
  summary?: string | null;
  raw_content?: string | null;
}
interface SignalNarrativeRow {
  signal_id: string;
  narrative_id: string;
}
interface SignalEntityRow {
  signal_id: string;
  entity_id: string;
}

/**
 * Rebuild the entire temporal layer (researcher+) for a server-supplied `now`.
 *
 *   1. Load narratives + their signal links → signals (source/captured/entity),
 *      amplification scores, community memberships → NarrativeInput[]/SignalInput[].
 *   2. captureSnapshots(now) → upsert one snapshot per narrative for `now`.
 *   3. Per narrative: load its ordered snapshot history → evolutionSeries → insert
 *      hsin_narrative_evolution rows (parent/child snapshot ids resolved to the
 *      persisted snapshot uuids, change_type, growth_pct, confidence, metrics/
 *      reasoning json).
 *   4. buildNarrativeGenealogy → upsert hsin_narrative_genealogy (unique parent/
 *      child/relationship).
 *   5. buildInfluenceNetwork → upsert hsin_narrative_influence (unique source/target).
 *   6. Per narrative: forecastNarrativeTrajectory → insert hsin_narrative_forecasts.
 *
 * The embedder is the deterministic OFFLINE local-lexical embedder (no network).
 * Each stage is wrapped so a partial failure still persists what it can — the
 * returned summary reflects what was actually written. NEVER throws.
 */
export async function rebuildTemporal(
  now: string,
): Promise<DbResult<RebuildTemporalSummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const summary: RebuildTemporalSummary = {
      snapshots: 0,
      evolution: 0,
      genealogy: 0,
      influence: 0,
      forecasts: 0,
    };

    // -------------------------------------------------------------------------
    // 1. Load the graph and assemble engine inputs.
    // -------------------------------------------------------------------------
    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('id, name, category, created_at')
      .limit(2000);
    if (nerr) return fail(nerr);
    const narrativeRowsArr = (narrativeRows ?? []) as NarrativeRow[];
    if (narrativeRowsArr.length === 0) {
      return { ok: true, data: summary };
    }
    const narrativeIds = narrativeRowsArr.map((n) => n.id);

    // signal<->narrative links → per-narrative signalIds.
    const { data: linkRows } = await client
      .from('hsin_signal_narratives')
      .select('signal_id, narrative_id')
      .in('narrative_id', narrativeIds)
      .limit(50000);
    const links = (linkRows ?? []) as SignalNarrativeRow[];

    const signalIdsByNarrative = new Map<string, string[]>();
    const allSignalIds = new Set<string>();
    for (const l of links) {
      const arr = signalIdsByNarrative.get(l.narrative_id) ?? [];
      arr.push(l.signal_id);
      signalIdsByNarrative.set(l.narrative_id, arr);
      allSignalIds.add(l.signal_id);
    }

    // Linked signals (source breadth + recency + text for genealogy).
    const signalRowsById = new Map<string, SignalRow>();
    const signalIdList = Array.from(allSignalIds);
    if (signalIdList.length > 0) {
      const { data: signalRows } = await client
        .from('hsin_signals')
        .select('id, source_id, captured_at, title, summary, raw_content')
        .in('id', signalIdList)
        .limit(50000);
      for (const s of (signalRows ?? []) as SignalRow[]) {
        signalRowsById.set(s.id, s);
      }
    }

    // signal<->entity links → per-signal entityIds (for genealogy/influence).
    const entityIdsBySignal = new Map<string, string[]>();
    if (signalIdList.length > 0) {
      const { data: seRows } = await client
        .from('hsin_signal_entities')
        .select('signal_id, entity_id')
        .in('signal_id', signalIdList)
        .limit(50000);
      for (const r of (seRows ?? []) as SignalEntityRow[]) {
        const arr = entityIdsBySignal.get(r.signal_id) ?? [];
        arr.push(r.entity_id);
        entityIdsBySignal.set(r.signal_id, arr);
      }
    }

    // Amplification scores (per narrative) → snapshot extras.
    const ampByNarrative = new Map<string, number>();
    {
      const { data: ampRows } = await client
        .from('hsin_amplification_scores')
        .select('narrative_id, amplification')
        .in('narrative_id', narrativeIds)
        .limit(20000);
      for (const r of (ampRows ?? []) as Array<{
        narrative_id: string;
        amplification?: number;
      }>) {
        if (typeof r.amplification === 'number') {
          ampByNarrative.set(r.narrative_id, r.amplification);
        }
      }
    }

    // Community memberships (per narrative) from hsin_graph_communities.
    const communityIdsByNarrative = new Map<string, string[]>();
    {
      const { data: commRows } = await client
        .from('hsin_graph_communities')
        .select('id, member_narrative_ids')
        .limit(5000);
      for (const c of (commRows ?? []) as Array<{
        id: string;
        member_narrative_ids?: string[];
      }>) {
        for (const nid of c.member_narrative_ids ?? []) {
          const arr = communityIdsByNarrative.get(nid) ?? [];
          arr.push(c.id);
          communityIdsByNarrative.set(nid, arr);
        }
      }
    }

    // Source reliability (per source) → narrative reliability extras (mean of the
    // narrative's signal sources' reliability scores).
    const reliabilityBySource = new Map<string, number>();
    {
      const sourceIds = Array.from(
        new Set(
          Array.from(signalRowsById.values())
            .map((s) => s.source_id ?? undefined)
            .filter((v): v is string => !!v),
        ),
      );
      if (sourceIds.length > 0) {
        const { data: relRows } = await client
          .from('hsin_source_reliability')
          .select('source_id, reliability_score')
          .in('source_id', sourceIds)
          .limit(20000);
        for (const r of (relRows ?? []) as Array<{
          source_id: string;
          reliability_score?: number;
        }>) {
          if (typeof r.reliability_score === 'number') {
            reliabilityBySource.set(r.source_id, r.reliability_score);
          }
        }
      }
    }

    // Build NarrativeInput[] + SignalInput[].
    const engineSignals: SignalInput[] = signalIdList.map((id) => {
      const s = signalRowsById.get(id);
      const link = links.find((l) => l.signal_id === id);
      return {
        id,
        narrativeId: link?.narrative_id,
        sourceId: s?.source_id ?? undefined,
        capturedAt: s?.captured_at ?? undefined,
        title: s?.title ?? undefined,
        bodyText: s?.raw_content ?? s?.summary ?? undefined,
        entityIds: entityIdsBySignal.get(id) ?? [],
      };
    });

    const engineNarratives: NarrativeInput[] = narrativeRowsArr.map((n) => {
      const sigIds = signalIdsByNarrative.get(n.id) ?? [];
      // Source / entity / time aggregation across the narrative's signals.
      const sourceIds = new Set<string>();
      const entityIds = new Set<string>();
      const capturedTimes: number[] = [];
      for (const sid of sigIds) {
        const s = signalRowsById.get(sid);
        if (s?.source_id) sourceIds.add(s.source_id);
        for (const e of entityIdsBySignal.get(sid) ?? []) entityIds.add(e);
        if (s?.captured_at) {
          const ms = Date.parse(s.captured_at);
          if (!Number.isNaN(ms)) capturedTimes.push(ms);
        }
      }
      const firstSeenAt = capturedTimes.length
        ? new Date(Math.min(...capturedTimes)).toISOString()
        : n.created_at ?? undefined;
      const lastSeenAt = capturedTimes.length
        ? new Date(Math.max(...capturedTimes)).toISOString()
        : undefined;
      return {
        id: n.id,
        name: n.name,
        category: n.category ?? undefined,
        signalIds: sigIds,
        entityIds: Array.from(entityIds),
        sourceIds: Array.from(sourceIds),
        communityIds: communityIdsByNarrative.get(n.id) ?? [],
        firstSeenAt,
        lastSeenAt,
      };
    });

    // Reliability per narrative = mean of its sources' reliability scores.
    const reliabilityByNarrative = new Map<string, number>();
    for (const n of engineNarratives) {
      const scores = (n.sourceIds ?? [])
        .map((sid) => reliabilityBySource.get(sid))
        .filter((v): v is number => typeof v === 'number');
      if (scores.length > 0) {
        reliabilityByNarrative.set(
          n.id,
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );
      }
    }

    // Deterministic offline embedder (no network / keys).
    const embedder = createEmbedder({ local: true });

    // -------------------------------------------------------------------------
    // 2. Capture one snapshot per narrative for `now` → upsert (idempotent per
    //    narrative_id + captured_at). Map narrative_id → persisted snapshot uuid.
    // -------------------------------------------------------------------------
    const engineSnapshots = captureSnapshots(
      engineNarratives,
      engineSignals,
      now,
      'daily',
    );

    // Enrich each engine snapshot with amplification/reliability extras (the pure
    // captureSnapshots derives counts; scores come from Phase-9 tables).
    const snapByNarrative = new Map<string, NarrativeSnapshot>();
    for (const snap of engineSnapshots) {
      const enriched: NarrativeSnapshot = {
        ...snap,
        amplificationScore: ampByNarrative.get(snap.narrativeId) ?? 0,
        reliabilityScore: reliabilityByNarrative.get(snap.narrativeId) ?? 0,
      };
      snapByNarrative.set(snap.narrativeId, enriched);
    }

    // persisted snapshot uuid for (narrative_id @ now).
    const persistedSnapshotId = new Map<string, string>();
    for (const snap of snapByNarrative.values()) {
      const payload = {
        narrative_id: snap.narrativeId,
        captured_at: now,
        signal_count: snap.signalCount,
        source_count: snap.sourceCount,
        community_count: snap.communityCount,
        amplification_score: snap.amplificationScore,
        reliability_score: snap.reliabilityScore,
        support_ratio: snap.supportRatio,
        contradiction_ratio: snap.contradictionRatio,
        metadata: toJson(snap.metadata),
      };
      // Upsert by (narrative_id, captured_at): update existing same-instant row,
      // else insert. There is no DB unique constraint on (narrative_id,
      // captured_at), so we do an explicit find-or-insert to stay idempotent.
      const { data: existing } = await client
        .from('hsin_narrative_snapshots')
        .select('id')
        .eq('narrative_id', snap.narrativeId)
        .eq('captured_at', now)
        .maybeSingle();
      if (existing?.id) {
        const { data, error } = await client
          .from('hsin_narrative_snapshots')
          .update(payload)
          .eq('id', existing.id as string)
          .select('id')
          .single();
        if (!error && data?.id) {
          persistedSnapshotId.set(snap.narrativeId, data.id as string);
          summary.snapshots += 1;
        }
      } else {
        const { data, error } = await client
          .from('hsin_narrative_snapshots')
          .insert(payload)
          .select('id')
          .single();
        if (!error && data?.id) {
          persistedSnapshotId.set(snap.narrativeId, data.id as string);
          summary.snapshots += 1;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. Per narrative: load the FULL ordered snapshot history (persisted rows),
    //    diff into evolution, insert evolution rows. The engine works on
    //    NarrativeSnapshot (camelCase); we map persisted rows back to it, keying
    //    the parent/child snapshot uuids by the persisted row id.
    // -------------------------------------------------------------------------
    for (const n of engineNarratives) {
      const { data: histRows } = await client
        .from('hsin_narrative_snapshots')
        .select('*')
        .eq('narrative_id', n.id)
        .order('captured_at', { ascending: true })
        .limit(2000);
      const history = (histRows ?? []) as HsinNarrativeSnapshotRecord[];
      if (history.length < 2) continue;

      // Map persisted rows → engine snapshots; the engine `id` carries the DB uuid
      // so the resulting EvolutionRecord parent/child ids are the persisted ids.
      const engineHistory: NarrativeSnapshot[] = history.map((r) => ({
        id: r.id,
        narrativeId: r.narrative_id,
        capturedAt: r.captured_at,
        signalCount: r.signal_count ?? 0,
        sourceCount: r.source_count ?? 0,
        communityCount: r.community_count ?? 0,
        amplificationScore: r.amplification_score ?? 0,
        reliabilityScore: r.reliability_score ?? 0,
        supportRatio: r.support_ratio ?? 0,
        contradictionRatio: r.contradiction_ratio ?? 0,
        metadata: r.metadata,
      }));

      const series: EvolutionRecord[] = evolutionSeries(engineHistory, now);
      for (const evo of series) {
        const metrics: JsonRecord = {
          amplificationDelta: evo.amplificationDelta,
          communityDelta: evo.communityDelta,
          sourceDelta: evo.sourceDelta,
          reliabilityDelta: evo.reliabilityDelta,
          contradictionDelta: evo.contradictionDelta,
        };
        const reasoning: JsonRecord = { reasoning: evo.reasoning };
        const { error } = await client.from('hsin_narrative_evolution').insert({
          narrative_id: evo.narrativeId,
          parent_snapshot_id: evo.parentSnapshotId,
          child_snapshot_id: evo.childSnapshotId,
          change_type: asChangeType(evo.changeType),
          growth_pct: evo.growthPct,
          confidence: evo.confidence,
          metrics_json: metrics,
          reasoning_json: reasoning,
        });
        if (!error) summary.evolution += 1;
      }
    }

    // -------------------------------------------------------------------------
    // 4. Genealogy: build the family tree → upsert (unique parent/child/relation).
    // -------------------------------------------------------------------------
    try {
      const edges: GenealogyEdge[] = await buildNarrativeGenealogy(
        engineNarratives,
        engineSignals,
        { now, embed: embedder.embed },
      );
      for (const e of edges) {
        const payload = {
          parent_narrative_id: e.parentNarrativeId,
          child_narrative_id: e.childNarrativeId,
          relationship: asRelationship(e.relationship),
          confidence: e.confidence,
          shared_entities: e.sharedEntities,
          shared_sources: e.sharedSources,
          similarity: e.similarity,
          rationale: e.rationale,
        };
        const { data: existing } = await client
          .from('hsin_narrative_genealogy')
          .select('id')
          .eq('parent_narrative_id', e.parentNarrativeId)
          .eq('child_narrative_id', e.childNarrativeId)
          .eq('relationship', payload.relationship)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await client
            .from('hsin_narrative_genealogy')
            .update(payload)
            .eq('id', existing.id as string);
          if (!error) summary.genealogy += 1;
        } else {
          const { error } = await client
            .from('hsin_narrative_genealogy')
            .insert(payload);
          if (!error) summary.genealogy += 1;
        }
      }
    } catch (e) {
      logError('temporal/persistence:genealogy', e);
    }

    // -------------------------------------------------------------------------
    // 5. Influence: build the directed network → upsert (unique source/target).
    //    Uses ALL persisted snapshots so amplification-transfer timing is honoured.
    // -------------------------------------------------------------------------
    try {
      const { data: allSnapRows } = await client
        .from('hsin_narrative_snapshots')
        .select('*')
        .in('narrative_id', narrativeIds)
        .order('captured_at', { ascending: true })
        .limit(50000);
      const allSnaps: NarrativeSnapshot[] = (
        (allSnapRows ?? []) as HsinNarrativeSnapshotRecord[]
      ).map((r) => ({
        id: r.id,
        narrativeId: r.narrative_id,
        capturedAt: r.captured_at,
        signalCount: r.signal_count ?? 0,
        sourceCount: r.source_count ?? 0,
        communityCount: r.community_count ?? 0,
        amplificationScore: r.amplification_score ?? 0,
        reliabilityScore: r.reliability_score ?? 0,
        supportRatio: r.support_ratio ?? 0,
        contradictionRatio: r.contradiction_ratio ?? 0,
        metadata: r.metadata,
      }));

      const infEdges: InfluenceEdge[] = buildInfluenceNetwork(
        engineNarratives,
        allSnaps,
        engineSignals,
        { now, embed: embedder.embed },
      );
      for (const e of infEdges) {
        const payload = {
          source_narrative_id: e.sourceNarrativeId,
          target_narrative_id: e.targetNarrativeId,
          influence_score: e.influenceScore,
          shared_entities: e.sharedEntities,
          shared_sources: e.sharedSources,
          shared_communities: e.sharedCommunities,
          rationale: e.rationale,
        };
        const { data: existing } = await client
          .from('hsin_narrative_influence')
          .select('id')
          .eq('source_narrative_id', e.sourceNarrativeId)
          .eq('target_narrative_id', e.targetNarrativeId)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await client
            .from('hsin_narrative_influence')
            .update(payload)
            .eq('id', existing.id as string);
          if (!error) summary.influence += 1;
        } else {
          const { error } = await client
            .from('hsin_narrative_influence')
            .insert(payload);
          if (!error) summary.influence += 1;
        }
      }
    } catch (e) {
      logError('temporal/persistence:influence', e);
    }

    // -------------------------------------------------------------------------
    // 6. Forecasts: per narrative, run the trajectory forecast → insert (append
    //    per run; generated_at stamps the run).
    // -------------------------------------------------------------------------
    for (const n of engineNarratives) {
      try {
        const { data: histRows } = await client
          .from('hsin_narrative_snapshots')
          .select('*')
          .eq('narrative_id', n.id)
          .order('captured_at', { ascending: true })
          .limit(2000);
        const history = (histRows ?? []) as HsinNarrativeSnapshotRecord[];
        const engineHistory: NarrativeSnapshot[] = history.map((r) => ({
          id: r.id,
          narrativeId: r.narrative_id,
          capturedAt: r.captured_at,
          signalCount: r.signal_count ?? 0,
          sourceCount: r.source_count ?? 0,
          communityCount: r.community_count ?? 0,
          amplificationScore: r.amplification_score ?? 0,
          reliabilityScore: r.reliability_score ?? 0,
          supportRatio: r.support_ratio ?? 0,
          contradictionRatio: r.contradiction_ratio ?? 0,
          metadata: r.metadata,
        }));
        const evoForForecast = evolutionSeries(engineHistory, now);

        const forecast: NarrativeForecast = forecastNarrativeTrajectory({
          narrativeId: n.id,
          snapshots: engineHistory,
          evolution: evoForForecast,
          now,
        });

        const { error } = await client.from('hsin_narrative_forecasts').insert({
          narrative_id: forecast.narrativeId,
          forecast_type: asForecastState(forecast.forecastType),
          probability: forecast.probability,
          reasoning: { reasoning: forecast.reasoning },
          distribution_json: toJson(forecast.distribution),
          generated_at: now,
        });
        if (!error) summary.forecasts += 1;
      } catch (e) {
        logError('temporal/persistence:forecast', e);
      }
    }

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the package temporalDemo().
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

export interface TemporalDemoViews {
  evolution: EvolutionView;
  genealogy: GenealogyView;
  influence: InfluenceView;
  forecast: ForecastView;
  highlights: TemporalHighlights;
}

/**
 * Build the Phase-10 view-models from the deterministic engine fixtures
 * (temporalDemo). Synthetic ids; clearly a demo. The UI renders this when Supabase
 * is not configured. NEVER throws (temporalDemo is pure/offline).
 */
export async function demoTemporal(): Promise<DbResult<TemporalDemoViews>> {
  try {
    const demo = await temporalDemo();
    const now = demo.now;

    // Synthetic narrative records from the fixture narrative ids/snapshots.
    const narrativeIds = Array.from(
      new Set([
        ...demo.snapshots.map((s) => s.narrativeId),
        ...demo.forecasts.map((f) => f.narrativeId),
      ]),
    );
    const nameOf = (id: string): string => {
      const snap = demo.snapshots.find((s) => s.narrativeId === id);
      const meta = snap?.metadata as { name?: string; category?: string } | undefined;
      return meta?.name ?? id;
    };
    const categoryOf = (id: string): string | undefined => {
      const snap = demo.snapshots.find((s) => s.narrativeId === id);
      const meta = snap?.metadata as { category?: string } | undefined;
      return meta?.category;
    };
    const narratives: HsinNarrativeRecord[] = narrativeIds.map((id) => ({
      id,
      name: nameOf(id),
      category: categoryOf(id),
      created_at: now,
      updated_at: now,
    }));

    const snapshots: HsinNarrativeSnapshotRecord[] = demo.snapshots.map((s) => ({
      id: s.id,
      narrative_id: s.narrativeId,
      captured_at: s.capturedAt,
      signal_count: s.signalCount,
      source_count: s.sourceCount,
      community_count: s.communityCount,
      amplification_score: s.amplificationScore,
      reliability_score: s.reliabilityScore,
      support_ratio: s.supportRatio,
      contradiction_ratio: s.contradictionRatio,
      metadata: toJson(s.metadata),
      created_at: now,
    }));

    const evolution: HsinNarrativeEvolutionRecord[] = demo.evolution.map(
      (e, i) => ({
        id: `demo-evo-${i}`,
        narrative_id: e.narrativeId,
        parent_snapshot_id: e.parentSnapshotId,
        child_snapshot_id: e.childSnapshotId,
        change_type: asChangeType(e.changeType),
        growth_pct: e.growthPct,
        confidence: e.confidence,
        metrics_json: {
          amplificationDelta: e.amplificationDelta,
          communityDelta: e.communityDelta,
          sourceDelta: e.sourceDelta,
          reliabilityDelta: e.reliabilityDelta,
          contradictionDelta: e.contradictionDelta,
        },
        reasoning_json: { reasoning: e.reasoning },
        created_at: now,
      }),
    );

    const genealogy: HsinNarrativeGenealogyRecord[] = demo.genealogy.map(
      (e, i) => ({
        id: `demo-gen-${i}`,
        parent_narrative_id: e.parentNarrativeId,
        child_narrative_id: e.childNarrativeId,
        relationship: asRelationship(e.relationship),
        confidence: e.confidence,
        shared_entities: e.sharedEntities,
        shared_sources: e.sharedSources,
        similarity: e.similarity,
        rationale: e.rationale,
        created_at: now,
      }),
    );

    const influence: HsinNarrativeInfluenceRecord[] = demo.influence.map(
      (e, i) => ({
        id: `demo-inf-${i}`,
        source_narrative_id: e.sourceNarrativeId,
        target_narrative_id: e.targetNarrativeId,
        influence_score: e.influenceScore,
        shared_entities: e.sharedEntities,
        shared_sources: e.sharedSources,
        shared_communities: e.sharedCommunities,
        rationale: e.rationale,
        created_at: now,
      }),
    );

    const forecasts: HsinNarrativeForecastRecord[] = demo.forecasts.map(
      (f, i) => ({
        id: `demo-fc-${i}`,
        narrative_id: f.narrativeId,
        forecast_type: asForecastState(f.forecastType),
        probability: f.probability,
        reasoning: { reasoning: f.reasoning },
        distribution_json: toJson(f.distribution),
        generated_at: f.generatedAt,
        created_at: now,
      }),
    );

    // Derive demo highlights the same way getTemporalHighlights does.
    const nameById = new Map(narratives.map((n) => [n.id, n.name]));
    const highlights: TemporalHighlights = {};
    {
      // Latest evolution per narrative (fixtures are time-ordered ascending).
      const latest = new Map<string, HsinNarrativeEvolutionRecord>();
      for (const e of evolution) {
        if (e.narrative_id) latest.set(e.narrative_id, e);
      }
      let bestGrowth: { id: string; v: number } | null = null;
      let bestCommunity: { id: string; v: number } | null = null;
      let bestAmp: { id: string; v: number } | null = null;
      for (const [id, e] of latest) {
        const g = e.growth_pct;
        if (typeof g === 'number' && (!bestGrowth || g > bestGrowth.v)) {
          bestGrowth = { id, v: g };
        }
        const m = e.metrics_json ?? {};
        const c = typeof m.communityDelta === 'number' ? m.communityDelta : undefined;
        if (c !== undefined && (!bestCommunity || c > bestCommunity.v)) {
          bestCommunity = { id, v: c };
        }
        const a =
          typeof m.amplificationDelta === 'number' ? m.amplificationDelta : undefined;
        if (a !== undefined && (!bestAmp || a > bestAmp.v)) bestAmp = { id, v: a };
      }
      if (bestGrowth) {
        highlights.fastestGrowing = {
          narrativeId: bestGrowth.id,
          name: nameById.get(bestGrowth.id) ?? bestGrowth.id,
          growthPct: bestGrowth.v,
        };
      }
      if (bestCommunity) {
        highlights.largestCommunityExpansion = {
          narrativeId: bestCommunity.id,
          name: nameById.get(bestCommunity.id) ?? bestCommunity.id,
          communityDelta: bestCommunity.v,
        };
      }
      if (bestAmp) {
        highlights.largestAmplificationSpike = {
          narrativeId: bestAmp.id,
          name: nameById.get(bestAmp.id) ?? bestAmp.id,
          amplificationDelta: bestAmp.v,
        };
      }
    }
    {
      const top = influence[0];
      if (top && typeof top.influence_score === 'number') {
        highlights.mostInfluential = {
          narrativeId: top.source_narrative_id ?? 'unknown',
          name: nameById.get(top.source_narrative_id ?? '') ?? 'unknown',
          influenceScore: top.influence_score,
        };
      }
    }
    {
      const emerging = forecasts
        .filter((f) => f.forecast_type === 'emerging')
        .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))[0];
      if (emerging && typeof emerging.probability === 'number') {
        highlights.newestEmerging = {
          narrativeId: emerging.narrative_id ?? 'unknown',
          name: nameById.get(emerging.narrative_id ?? '') ?? 'unknown',
          probability: emerging.probability,
        };
      }
    }

    return {
      ok: true,
      data: {
        evolution: { narratives, snapshots, evolution },
        genealogy: { narratives, edges: genealogy },
        influence: { narratives, edges: influence },
        forecast: { narratives, forecasts },
        highlights,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as temporalDbClient, requireRole as requireTemporalRole };
