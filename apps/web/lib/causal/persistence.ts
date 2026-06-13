// =============================================================================
// HSIN Phase 11 — Causal Intelligence & Narrative Replay data-access layer (DAL).
// SERVER-ONLY.
//
// "Why did the idea change, and let me replay the story." The persistence layer
// for the Phase-11 causal + replay layer over the Phase-8/9/10 narrative graph
// (migration 0015):
//   * EVENTS      — hsin_causal_events: discrete, typed causal events (surges,
//                   expansions, spikes, shifts, transfers) with strength/conf.
//   * CHAINS      — hsin_causal_chains + hsin_causal_chain_events: ordered,
//                   explainable sequences of events ("why it moved").
//   * REPLAY      — hsin_replay_frames: point-in-time scrubber frames.
//   * MILESTONES  — hsin_narrative_milestones: life-cycle markers (birth → growth
//                   → viral → peak → decline → death → resurgence).
//
// The PURE, deterministic engine lives in '@hsi/causal-intelligence'. This DAL
// loads each narrative's TEMPORAL inputs from the Phase-10 hsin_* tables
// (snapshots / evolution / influence / forecast), feeds them to the engine, and
// persists the results. Reads assemble the Phase-11 view-models the WorldForge
// causal / replay / milestone consoles render; getNarrativeCausal +
// getWorldforgeTimeline are the WorldForge fusion-bridge adapters.
//
// SERVER-ONLY — never import from a 'use client' module (uses next/headers via
// lib/supabase/server.ts). `server-only` is not installed in this workspace, so
// this comment stands in for the import (mirrors lib/temporal/persistence.ts).
//
// AUTHZ MODEL (migration 0015 RLS, mirrored here for clean DbResult errors):
//   * All 5 Phase-11 tables are part of the SHARED narrative-intelligence graph:
//       authenticated READ; researcher+ INSERT/UPDATE/DELETE; admin all.
//   * We gate rebuildCausal at researcher (RLS is the backstop). Reads go through
//     the RLS client. NO service-role path — the background causal worker uses
//     service_role; the app is RLS-scoped.
//
// DESIGN: every function returns DbResult<T> and NEVER throws. Empty Supabase env
// degrades gracefully (NOT_CONFIGURED) so `next build` passes. The rebuild wraps
// each stage so a partial failure still persists what it can.
// =============================================================================

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { formatErrorMessage, logError } from '@/lib/errors/format-error';
import { createClient } from '@/lib/supabase/server';
import {
  buildCausalChains,
  buildReplayFrames,
  causalDemo,
  detectCausalEvents,
  detectNarrativeMilestones,
  explainNarrativeChange as engineExplainNarrativeChange,
  type CausalChain,
  type CausalEvent,
  type CausalEventType as EngineCausalEventType,
  type CausalInput,
  type EvolutionRecord,
  type InfluenceEdge,
  type MilestoneType as EngineMilestoneType,
  type NarrativeForecast,
  type NarrativeMilestone,
  type NarrativeSnapshot,
  type ReplayFrame,
} from '@hsi/causal-intelligence';
import type {
  AppRole,
  CausalEventType,
  CausalExplanation,
  CausalHighlights,
  CausalView,
  HsinCausalChainEventRecord,
  HsinCausalChainRecord,
  HsinCausalEventRecord,
  HsinNarrativeForecastRecord,
  HsinNarrativeMilestoneRecord,
  HsinNarrativeRecord,
  HsinReplayFrameRecord,
  MilestonesView,
  MilestoneType,
  ReplayView,
  WorldforgeTimeline,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Result type — canonical DbResult with 'FORBIDDEN' (Phase 6/7/8/9/10).
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
  logError('causal/persistence', error);
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
// Client + identity + role helpers (mirror lib/temporal/persistence.ts).
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
  return loadHighestRole(client, user.id);
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

/** Read a numeric metric out of a jsonb record, else undefined. */
function numFrom(rec: JsonRecord | undefined, key: string): number | undefined {
  const v = rec?.[key];
  return typeof v === 'number' ? v : undefined;
}

/** Read a string metric out of a jsonb record, else undefined. */
function strFrom(rec: JsonRecord | undefined, key: string): string | undefined {
  const v = rec?.[key];
  return typeof v === 'string' ? v : undefined;
}

// -----------------------------------------------------------------------------
// Engine union → DB union guards. The engine + DB use identical string sets;
// these guards keep the persisted value inside the migration-0015 CHECK domains.
// -----------------------------------------------------------------------------
const CAUSAL_EVENT_TYPES: CausalEventType[] = [
  'signal_surge',
  'source_expansion',
  'community_growth',
  'amplification_spike',
  'contradiction_drop',
  'contradiction_rise',
  'forecast_shift',
  'influence_transfer',
];

const MILESTONE_TYPES: MilestoneType[] = [
  'birth',
  'growth',
  'viral',
  'peak',
  'decline',
  'death',
  'resurgence',
];

function asEventType(t: EngineCausalEventType | string): CausalEventType {
  return (CAUSAL_EVENT_TYPES as string[]).includes(t)
    ? (t as CausalEventType)
    : 'signal_surge';
}

function asMilestoneType(t: EngineMilestoneType | string): MilestoneType {
  return (MILESTONE_TYPES as string[]).includes(t)
    ? (t as MilestoneType)
    : 'birth';
}

// -----------------------------------------------------------------------------
// DB row → engine input adapters. Reused by every read that loads a CausalInput.
// -----------------------------------------------------------------------------

interface SnapshotRow {
  id: string;
  narrative_id: string;
  captured_at: string;
  signal_count?: number | null;
  source_count?: number | null;
  community_count?: number | null;
  amplification_score?: number | null;
  reliability_score?: number | null;
  support_ratio?: number | null;
  contradiction_ratio?: number | null;
  metadata?: JsonRecord | null;
}

function rowToSnapshot(r: SnapshotRow): NarrativeSnapshot {
  return {
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
    metadata: r.metadata ?? undefined,
  };
}

interface EvolutionRow {
  id: string;
  narrative_id?: string | null;
  parent_snapshot_id?: string | null;
  child_snapshot_id?: string | null;
  change_type?: string | null;
  growth_pct?: number | null;
  confidence?: number | null;
  metrics_json?: JsonRecord | null;
  reasoning_json?: JsonRecord | null;
  created_at?: string | null;
}

const EVOLUTION_CHANGE_TYPES = ['growth', 'decline', 'mutation', 'split', 'merge'];

function rowToEvolution(r: EvolutionRow): EvolutionRecord {
  const m = r.metrics_json ?? {};
  const reasoningRaw = r.reasoning_json?.reasoning;
  const ct = r.change_type ?? 'growth';
  return {
    id: r.id,
    narrativeId: r.narrative_id ?? '',
    parentSnapshotId: r.parent_snapshot_id ?? '',
    childSnapshotId: r.child_snapshot_id ?? '',
    changeType: (EVOLUTION_CHANGE_TYPES.includes(ct)
      ? ct
      : 'growth') as EvolutionRecord['changeType'],
    growthPct: r.growth_pct ?? 0,
    amplificationDelta: numFrom(m, 'amplificationDelta') ?? 0,
    communityDelta: numFrom(m, 'communityDelta') ?? 0,
    sourceDelta: numFrom(m, 'sourceDelta') ?? 0,
    reliabilityDelta: numFrom(m, 'reliabilityDelta') ?? 0,
    contradictionDelta: numFrom(m, 'contradictionDelta') ?? 0,
    confidence: r.confidence ?? 0,
    reasoning: Array.isArray(reasoningRaw)
      ? (reasoningRaw as unknown[]).map((x) => String(x))
      : [],
    createdAt: r.created_at ?? '',
  };
}

interface InfluenceRow {
  id: string;
  source_narrative_id: string;
  target_narrative_id: string;
  influence_score?: number | null;
  shared_entities?: number | null;
  shared_sources?: number | null;
  shared_communities?: number | null;
  rationale?: string | null;
  created_at: string;
}

function rowToInfluence(r: InfluenceRow): InfluenceEdge {
  return {
    id: r.id,
    sourceNarrativeId: r.source_narrative_id,
    targetNarrativeId: r.target_narrative_id,
    influenceScore: r.influence_score ?? 0,
    sharedEntities: r.shared_entities ?? 0,
    sharedSources: r.shared_sources ?? 0,
    sharedCommunities: r.shared_communities ?? 0,
    rationale: r.rationale ?? '',
    createdAt: r.created_at,
  };
}

const FORECAST_STATES = ['emerging', 'rising', 'stable', 'declining', 'dead'];

function recordToForecast(
  r: HsinNarrativeForecastRecord | undefined,
): NarrativeForecast | undefined {
  if (!r) return undefined;
  const ft = r.forecast_type ?? 'stable';
  const reasoningRaw = (r.reasoning ?? {}).reasoning;
  const dist = r.distribution_json as
    | NarrativeForecast['distribution']
    | undefined;
  return {
    id: r.id,
    narrativeId: r.narrative_id ?? '',
    forecastType: (FORECAST_STATES.includes(ft)
      ? ft
      : 'stable') as NarrativeForecast['forecastType'],
    probability: r.probability ?? 0,
    reasoning: Array.isArray(reasoningRaw)
      ? (reasoningRaw as unknown[]).map((x) => String(x))
      : [],
    distribution: dist,
    generatedAt: r.generated_at,
  };
}

/**
 * Load the full CausalInput for one narrative from the Phase-10 temporal tables.
 * Snapshots (ordered) + evolution + inbound/outbound influence + latest forecast.
 * Returns null only on a hard query error (caller decides how to surface it).
 * NEVER throws.
 */
async function loadCausalInput(
  client: SupabaseClient,
  narrativeId: string,
  now: string,
): Promise<CausalInput> {
  const { data: snapRows } = await client
    .from('hsin_narrative_snapshots')
    .select(
      'id, narrative_id, captured_at, signal_count, source_count, community_count, amplification_score, reliability_score, support_ratio, contradiction_ratio, metadata',
    )
    .eq('narrative_id', narrativeId)
    .order('captured_at', { ascending: true })
    .limit(5000);
  const snapshots = ((snapRows ?? []) as SnapshotRow[]).map(rowToSnapshot);

  const { data: evoRows } = await client
    .from('hsin_narrative_evolution')
    .select('*')
    .eq('narrative_id', narrativeId)
    .order('created_at', { ascending: true })
    .limit(5000);
  const evolution = ((evoRows ?? []) as EvolutionRow[]).map(rowToEvolution);

  const { data: inRows } = await client
    .from('hsin_narrative_influence')
    .select('*')
    .eq('target_narrative_id', narrativeId)
    .order('influence_score', { ascending: false })
    .limit(2000);
  const influenceIn = ((inRows ?? []) as InfluenceRow[]).map(rowToInfluence);

  const { data: outRows } = await client
    .from('hsin_narrative_influence')
    .select('*')
    .eq('source_narrative_id', narrativeId)
    .order('influence_score', { ascending: false })
    .limit(2000);
  const influenceOut = ((outRows ?? []) as InfluenceRow[]).map(rowToInfluence);

  const { data: fcRows } = await client
    .from('hsin_narrative_forecasts')
    .select('*')
    .eq('narrative_id', narrativeId)
    .order('generated_at', { ascending: false })
    .limit(1);
  const forecast = recordToForecast(
    ((fcRows ?? []) as HsinNarrativeForecastRecord[])[0],
  );

  return {
    narrativeId,
    snapshots,
    evolution,
    influenceIn,
    influenceOut,
    forecast,
    now,
  };
}

// -----------------------------------------------------------------------------
// Engine value → view-model record adapters (for derived/non-persisted reads).
// -----------------------------------------------------------------------------

function eventToRecord(e: CausalEvent, createdAt: string): HsinCausalEventRecord {
  return {
    id: e.id ?? `evt_${e.narrativeId}_${e.eventType}_${e.occurredAt}`,
    narrative_id: e.narrativeId,
    event_type: asEventType(e.eventType),
    event_strength: e.eventStrength,
    confidence: e.confidence,
    explanation: e.explanation,
    metrics_json: toJson(e.metrics),
    occurred_at: e.occurredAt,
    created_at: createdAt,
  };
}

function milestoneToRecord(
  m: NarrativeMilestone,
  createdAt: string,
): HsinNarrativeMilestoneRecord {
  return {
    id: m.id ?? `ms_${m.narrativeId}_${m.milestoneType}_${m.occurredAt}`,
    narrative_id: m.narrativeId,
    milestone_type: asMilestoneType(m.milestoneType),
    confidence: m.confidence,
    description: m.description,
    metrics_json: toJson(m.metrics),
    occurred_at: m.occurredAt,
    created_at: createdAt,
  };
}

// =============================================================================
// READS (authenticated — RLS scopes visibility; anon/empty → empty lists)
// =============================================================================

export interface CausalFilters {
  narrativeId?: string;
}

/**
 * Causal view: visible narratives + their causal events + the chains (with their
 * member events resolved via hsin_causal_chain_events). `narrativeId` scopes to a
 * single narrative. RLS: any authenticated user reads. NEVER throws.
 */
export async function getCausal(
  filters?: CausalFilters,
): Promise<DbResult<CausalView>> {
  try {
    const client = db();

    let nq = client.from('hsin_narratives').select('*');
    if (filters?.narrativeId) nq = nq.eq('id', filters.narrativeId);
    const { data: narrativeRows, error: nerr } = await nq
      .order('created_at', { ascending: false })
      .limit(1000);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    let eq = client.from('hsin_causal_events').select('*');
    if (filters?.narrativeId) eq = eq.eq('narrative_id', filters.narrativeId);
    const { data: eventRows, error: eerr } = await eq
      .order('occurred_at', { ascending: true })
      .limit(10000);
    if (eerr) return fail(eerr);
    const events = (eventRows ?? []) as HsinCausalEventRecord[];
    const eventById = new Map<string, HsinCausalEventRecord>();
    for (const e of events) eventById.set(e.id, e);

    let cq = client.from('hsin_causal_chains').select('*');
    if (filters?.narrativeId) cq = cq.eq('narrative_id', filters.narrativeId);
    const { data: chainRows, error: cerr } = await cq
      .order('created_at', { ascending: false })
      .limit(5000);
    if (cerr) return fail(cerr);
    const chainRecords = (chainRows ?? []) as HsinCausalChainRecord[];

    // Chain → ordered member events (via hsin_causal_chain_events).
    const chainIds = chainRecords.map((c) => c.id);
    const membersByChain = new Map<string, HsinCausalChainEventRecord[]>();
    if (chainIds.length > 0) {
      const { data: memberRows } = await client
        .from('hsin_causal_chain_events')
        .select('*')
        .in('chain_id', chainIds)
        .order('sequence_order', { ascending: true })
        .limit(20000);
      for (const m of (memberRows ?? []) as HsinCausalChainEventRecord[]) {
        const list = membersByChain.get(m.chain_id) ?? [];
        list.push(m);
        membersByChain.set(m.chain_id, list);
      }
    }

    const chains = chainRecords.map((c) => {
      const members = (membersByChain.get(c.id) ?? []).sort(
        (a, b) => a.sequence_order - b.sequence_order,
      );
      const chainEvents: HsinCausalEventRecord[] = [];
      for (const m of members) {
        const ev = m.event_id ? eventById.get(m.event_id) : undefined;
        if (ev) chainEvents.push(ev);
      }
      return { ...c, events: chainEvents };
    });

    return { ok: true, data: { narratives, events, chains } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Replay view: a single narrative + its ordered replay frames + its lifecycle
 * milestones. RLS: any authenticated user reads. NEVER throws.
 */
export async function getReplay(
  narrativeId: string,
): Promise<DbResult<ReplayView>> {
  try {
    const client = db();

    const { data: narrativeRow } = await client
      .from('hsin_narratives')
      .select('*')
      .eq('id', narrativeId)
      .maybeSingle();
    const narrative = (narrativeRow as HsinNarrativeRecord | null) ?? null;

    const { data: frameRows, error: ferr } = await client
      .from('hsin_replay_frames')
      .select('*')
      .eq('narrative_id', narrativeId)
      .order('frame_timestamp', { ascending: true })
      .limit(10000);
    if (ferr) return fail(ferr);
    const frames = (frameRows ?? []) as HsinReplayFrameRecord[];

    const { data: msRows } = await client
      .from('hsin_narrative_milestones')
      .select('*')
      .eq('narrative_id', narrativeId)
      .order('occurred_at', { ascending: true })
      .limit(5000);
    const milestones = (msRows ?? []) as HsinNarrativeMilestoneRecord[];

    return { ok: true, data: { narrative, frames, milestones } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Milestones view: visible narratives + their lifecycle milestones. `narrativeId`
 * scopes to one narrative. RLS: any authenticated user reads. NEVER throws.
 */
export async function getMilestones(
  narrativeId?: string,
): Promise<DbResult<MilestonesView>> {
  try {
    const client = db();

    let nq = client.from('hsin_narratives').select('*');
    if (narrativeId) nq = nq.eq('id', narrativeId);
    const { data: narrativeRows, error: nerr } = await nq
      .order('created_at', { ascending: false })
      .limit(1000);
    if (nerr) return fail(nerr);
    const narratives = (narrativeRows ?? []) as HsinNarrativeRecord[];

    let mq = client.from('hsin_narrative_milestones').select('*');
    if (narrativeId) mq = mq.eq('narrative_id', narrativeId);
    const { data: msRows, error: merr } = await mq
      .order('occurred_at', { ascending: true })
      .limit(10000);
    if (merr) return fail(merr);
    const milestones = (msRows ?? []) as HsinNarrativeMilestoneRecord[];

    return { ok: true, data: { narratives, milestones } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Derive the headline causal callouts for the dashboard:
 *   * mostSignificantEvent           — event with the max strength×confidence;
 *   * fastestGrowth                  — strongest signal_surge (deltaPct metric);
 *   * largestForecastShift           — strongest forecast_shift event;
 *   * largestAmplificationSpike      — strongest amplification_spike event;
 *   * mostImportantCommunityExpansion— strongest community_growth event;
 *   * mostInfluentialSource          — best-effort from hsin_source_reliability,
 *                                      else the strongest influence edge.
 * Best-effort: each callout degrades to undefined on missing data. RLS: any
 * authenticated user reads. NEVER throws.
 */
export async function getCausalHighlights(): Promise<
  DbResult<CausalHighlights>
> {
  try {
    const client = db();

    // Narrative name lookup.
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

    const highlights: CausalHighlights = {};

    // ---- Event-derived callouts -------------------------------------------
    {
      const { data: eventRows } = await client
        .from('hsin_causal_events')
        .select('narrative_id, event_type, event_strength, confidence, metrics_json, explanation')
        .limit(20000);
      const events = (eventRows ?? []) as Array<{
        narrative_id: string;
        event_type: CausalEventType;
        event_strength?: number;
        confidence?: number;
        metrics_json?: JsonRecord;
        explanation?: string;
      }>;

      let bestSig: { id: string; type: CausalEventType; v: number } | null = null;
      let bestGrowth: { id: string; pct: number } | null = null;
      let bestForecast: { id: string; detail: string; v: number } | null = null;
      let bestAmp: { id: string; v: number } | null = null;
      let bestComm: { id: string; v: number } | null = null;

      for (const e of events) {
        const strength = typeof e.event_strength === 'number' ? e.event_strength : 0;
        const conf = typeof e.confidence === 'number' ? e.confidence : 0;
        const impact = strength * conf;
        if (!bestSig || impact > bestSig.v) {
          bestSig = { id: e.narrative_id, type: e.event_type, v: impact };
        }
        if (e.event_type === 'signal_surge') {
          const pct = numFrom(e.metrics_json, 'deltaPct');
          if (pct !== undefined && (!bestGrowth || pct > bestGrowth.pct)) {
            bestGrowth = { id: e.narrative_id, pct };
          }
        }
        if (e.event_type === 'forecast_shift' && (!bestForecast || strength > bestForecast.v)) {
          const from = strFrom(e.metrics_json, 'fromState');
          const to = strFrom(e.metrics_json, 'toState');
          const detail =
            from && to ? `${from} → ${to}` : e.explanation ?? 'forecast shifted';
          bestForecast = { id: e.narrative_id, detail, v: strength };
        }
        if (e.event_type === 'amplification_spike' && (!bestAmp || strength > bestAmp.v)) {
          bestAmp = { id: e.narrative_id, v: strength };
        }
        if (e.event_type === 'community_growth' && (!bestComm || strength > bestComm.v)) {
          bestComm = { id: e.narrative_id, v: strength };
        }
      }

      if (bestSig) {
        // mostSignificantEvent needs the actual strength (not the impact product).
        const top = events
          .filter((e) => e.narrative_id === bestSig!.id && e.event_type === bestSig!.type)
          .sort((a, b) => (b.event_strength ?? 0) - (a.event_strength ?? 0))[0];
        highlights.mostSignificantEvent = {
          narrativeId: bestSig.id,
          name: nameOf(bestSig.id),
          eventType: bestSig.type,
          eventStrength: top?.event_strength ?? 0,
        };
      }
      if (bestGrowth) {
        highlights.fastestGrowth = {
          narrativeId: bestGrowth.id,
          name: nameOf(bestGrowth.id),
          growthPct: bestGrowth.pct,
        };
      }
      if (bestForecast) {
        highlights.largestForecastShift = {
          narrativeId: bestForecast.id,
          name: nameOf(bestForecast.id),
          detail: bestForecast.detail,
        };
      }
      if (bestAmp) {
        highlights.largestAmplificationSpike = {
          narrativeId: bestAmp.id,
          name: nameOf(bestAmp.id),
          eventStrength: bestAmp.v,
        };
      }
      if (bestComm) {
        highlights.mostImportantCommunityExpansion = {
          narrativeId: bestComm.id,
          name: nameOf(bestComm.id),
          eventStrength: bestComm.v,
        };
      }
    }

    // ---- Most influential source (best-effort) ----------------------------
    // Prefer the Phase-9 source-reliability table (the most reliable, productive
    // source); fall back to the strongest narrative influence edge.
    {
      const { data: relRows } = await client
        .from('hsin_source_reliability')
        .select('source_id, reliability_score, tier, signal_count')
        .order('reliability_score', { ascending: false })
        .limit(1);
      const topRel = ((relRows ?? []) as Array<{
        source_id: string;
        reliability_score?: number;
        tier?: string;
        signal_count?: number;
      }>)[0];
      if (topRel && typeof topRel.reliability_score === 'number') {
        highlights.mostInfluentialSource = {
          sourceId: topRel.source_id,
          name: topRel.source_id,
          detail: `reliability ${topRel.reliability_score}${
            topRel.tier ? ` (${topRel.tier})` : ''
          }${topRel.signal_count ? `, ${topRel.signal_count} signals` : ''}`,
        };
      } else {
        const { data: infRows } = await client
          .from('hsin_narrative_influence')
          .select('source_narrative_id, influence_score')
          .order('influence_score', { ascending: false })
          .limit(1);
        const topInf = ((infRows ?? []) as Array<{
          source_narrative_id?: string;
          influence_score?: number;
        }>)[0];
        if (topInf && typeof topInf.influence_score === 'number') {
          highlights.mostInfluentialSource = {
            name: nameOf(topInf.source_narrative_id),
            detail: `influence score ${topInf.influence_score}`,
          };
        }
      }
    }

    return { ok: true, data: highlights };
  } catch (e) {
    return fail(e);
  }
}

export interface NarrativeCausalBundle {
  events: HsinCausalEventRecord[];
  chains: (HsinCausalChainRecord & { events: HsinCausalEventRecord[] })[];
  milestones: HsinNarrativeMilestoneRecord[];
  explanation?: CausalExplanation;
}

/**
 * The full causal bundle for ONE narrative — the signal-detail integration / the
 * WorldForge fusion-bridge adapter. Persisted events + chains + milestones, plus a
 * DERIVED explanation computed on read from the narrative's temporal inputs. RLS:
 * any authenticated user reads. NEVER throws.
 */
export async function getNarrativeCausal(
  narrativeId: string,
): Promise<DbResult<NarrativeCausalBundle>> {
  try {
    const causal = await getCausal({ narrativeId });
    if (!causal.ok) return causal;
    const milestones = await getMilestones(narrativeId);
    if (!milestones.ok) return milestones;

    // Derived explanation (best-effort — never fails the bundle).
    let explanation: CausalExplanation | undefined;
    const exp = await explainNarrativeChange(narrativeId);
    if (exp.ok) explanation = exp.data;

    return {
      ok: true,
      data: {
        events: causal.data.events,
        chains: causal.data.chains,
        milestones: milestones.data.milestones,
        explanation,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Explain a narrative's change — DERIVED ON READ (not persisted). Loads the
 * narrative's CausalInput from the temporal hsin_* tables, runs
 * detectCausalEvents → buildCausalChains → engine explainNarrativeChange, and
 * returns the CausalExplanation view-model. RLS: any authenticated user reads.
 * NEVER throws.
 */
export async function explainNarrativeChange(
  narrativeId: string,
): Promise<DbResult<CausalExplanation>> {
  try {
    const client = db();
    const now = new Date().toISOString();
    const input = await loadCausalInput(client, narrativeId, now);

    const events = detectCausalEvents(input);
    const chains = buildCausalChains(events, input);
    const explanation = engineExplainNarrativeChange(input, events, chains);

    return {
      ok: true,
      data: {
        narrativeId: explanation.narrativeId,
        headline: explanation.headline,
        text: explanation.text,
        factors: explanation.factors.map((f) => ({
          label: f.label,
          detail: f.detail,
          metric: f.metric,
        })),
        confidence: explanation.confidence,
        generatedAt: explanation.generatedAt,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Build the WorldForge narrative timeline for ONE narrative — the WorldForge
 * fusion-bridge adapter. Composes:
 *   * turningPoints      — from the persisted milestones (life-cycle markers);
 *   * epochs             — the narrative's snapshots grouped into life phases by
 *                          the milestone boundaries (birth..peak / peak..death etc.);
 *   * counterfactualSeeds— "what if?" prompts seeded from the highest-strength
 *                          causal events ("What if the amplification spike on
 *                          <date> never occurred?").
 * RLS: any authenticated user reads. NEVER throws.
 */
export async function getWorldforgeTimeline(
  narrativeId: string,
): Promise<DbResult<WorldforgeTimeline>> {
  try {
    const client = db();

    // Milestones → turning points.
    const { data: msRows } = await client
      .from('hsin_narrative_milestones')
      .select('*')
      .eq('narrative_id', narrativeId)
      .order('occurred_at', { ascending: true })
      .limit(5000);
    const milestones = (msRows ?? []) as HsinNarrativeMilestoneRecord[];

    const turningPoints = milestones
      .filter((m) => !!m.occurred_at)
      .map((m) => ({
        at: m.occurred_at as string,
        milestoneType: m.milestone_type,
        description: m.description ?? m.milestone_type,
      }));

    // Snapshots → epochs (grouped by milestone boundaries).
    const { data: snapRows } = await client
      .from('hsin_narrative_snapshots')
      .select('id, narrative_id, captured_at, signal_count, amplification_score')
      .eq('narrative_id', narrativeId)
      .order('captured_at', { ascending: true })
      .limit(5000);
    const snaps = (snapRows ?? []) as Array<{
      captured_at: string;
      signal_count?: number;
      amplification_score?: number;
    }>;

    const epochs: WorldforgeTimeline['epochs'] = [];
    if (snaps.length > 0) {
      // Boundaries: each milestone's occurred_at that falls within the snapshot
      // window opens a new epoch labeled by the milestone it begins with.
      const boundaries = [...turningPoints]
        .filter((tp) => tp.at >= snaps[0].captured_at)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

      if (boundaries.length === 0) {
        const first = snaps[0];
        const last = snaps[snaps.length - 1];
        epochs.push({
          label: 'Full history',
          startAt: first.captured_at,
          endAt: last.captured_at,
          summary: `${snaps.length} snapshots; signals ${first.signal_count ?? 0}→${
            last.signal_count ?? 0
          }`,
        });
      } else {
        for (let i = 0; i < boundaries.length; i += 1) {
          const start = boundaries[i].at;
          const end =
            i + 1 < boundaries.length
              ? boundaries[i + 1].at
              : snaps[snaps.length - 1].captured_at;
          const within = snaps.filter(
            (s) => s.captured_at >= start && s.captured_at <= end,
          );
          const fromSig = within[0]?.signal_count ?? 0;
          const toSig = within[within.length - 1]?.signal_count ?? fromSig;
          epochs.push({
            label: `${boundaries[i].milestoneType} epoch`,
            startAt: start,
            endAt: end,
            summary:
              within.length > 0
                ? `${within.length} snapshot${
                    within.length === 1 ? '' : 's'
                  }; signals ${fromSig}→${toSig}`
                : `from ${boundaries[i].milestoneType}`,
          });
        }
      }
    }

    // High-strength causal events → counterfactual seeds.
    const { data: eventRows } = await client
      .from('hsin_causal_events')
      .select('event_type, event_strength, explanation, occurred_at, metrics_json')
      .eq('narrative_id', narrativeId)
      .order('event_strength', { ascending: false })
      .limit(8);
    const events = (eventRows ?? []) as Array<{
      event_type: CausalEventType;
      event_strength?: number;
      explanation?: string;
      occurred_at?: string;
      metrics_json?: JsonRecord;
    }>;

    const phraseFor = (t: CausalEventType): string => {
      switch (t) {
        case 'signal_surge':
          return 'signal surge';
        case 'source_expansion':
          return 'source expansion';
        case 'community_growth':
          return 'community expansion';
        case 'amplification_spike':
          return 'amplification spike';
        case 'contradiction_drop':
          return 'drop in contradictions';
        case 'contradiction_rise':
          return 'rise in contradictions';
        case 'forecast_shift':
          return 'forecast shift';
        case 'influence_transfer':
          return 'influence transfer';
        default:
          return 'event';
      }
    };

    const counterfactualSeeds = events
      .filter((e) => (e.event_strength ?? 0) > 0)
      .slice(0, 5)
      .map((e) => {
        const day = e.occurred_at ? e.occurred_at.slice(0, 10) : 'an unknown date';
        return {
          prompt: `What if the ${phraseFor(e.event_type)} on ${day} never occurred?`,
          basis: e.explanation ?? `${e.event_type} (strength ${e.event_strength ?? 0})`,
        };
      });

    return {
      ok: true,
      data: { narrativeId, epochs, turningPoints, counterfactualSeeds },
    };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// REBUILD (researcher+) — the END-TO-END compute + persist chain.
// =============================================================================

export interface RebuildCausalSummary {
  events: number;
  chains: number;
  replayFrames: number;
  milestones: number;
}

interface NarrativeIdRow {
  id: string;
}

/**
 * Rebuild the entire causal + replay layer (researcher+) for a server-supplied
 * `now`. For each narrative:
 *   1. Load its CausalInput from the temporal tables (snapshots ordered,
 *      evolution, inbound/outbound influence, latest forecast).
 *   2. detectCausalEvents → insert hsin_causal_events; capture the persisted ids
 *      keyed by the engine's deterministic event id.
 *   3. buildCausalChains → insert hsin_causal_chains + hsin_causal_chain_events
 *      (sequence_order, event_id mapped to the persisted event ids).
 *   4. buildReplayFrames → upsert hsin_replay_frames (unique narrative_id +
 *      frame_timestamp; frame_data jsonb).
 *   5. detectNarrativeMilestones → insert hsin_narrative_milestones.
 *
 * Each stage is wrapped so a partial failure still persists what it can; the
 * returned summary reflects what was actually written. NEVER throws.
 */
export async function rebuildCausal(
  now: string,
): Promise<DbResult<RebuildCausalSummary>> {
  try {
    const client = db();
    const gate = await requireRole(client, 'researcher');
    if (!gate.ok) return gate;

    const summary: RebuildCausalSummary = {
      events: 0,
      chains: 0,
      replayFrames: 0,
      milestones: 0,
    };

    const { data: narrativeRows, error: nerr } = await client
      .from('hsin_narratives')
      .select('id')
      .limit(2000);
    if (nerr) return fail(nerr);
    const narrativeIds = ((narrativeRows ?? []) as NarrativeIdRow[]).map((n) => n.id);
    if (narrativeIds.length === 0) return { ok: true, data: summary };

    for (const narrativeId of narrativeIds) {
      try {
        // 1. Load engine input from the temporal layer.
        const input = await loadCausalInput(client, narrativeId, now);
        if (input.snapshots.length === 0) continue;

        // 2. Events → insert, mapping engine deterministic id → persisted uuid.
        const events: CausalEvent[] = detectCausalEvents(input);
        const persistedEventId = new Map<string, string>();
        for (const e of events) {
          const engineId =
            e.id ?? `evt_${e.narrativeId}_${e.eventType}_${e.occurredAt}`;
          const { data, error } = await client
            .from('hsin_causal_events')
            .insert({
              narrative_id: e.narrativeId,
              event_type: asEventType(e.eventType),
              event_strength: e.eventStrength,
              confidence: e.confidence,
              explanation: e.explanation,
              metrics_json: toJson(e.metrics),
              occurred_at: e.occurredAt,
            })
            .select('id')
            .single();
          if (!error && data?.id) {
            persistedEventId.set(engineId, data.id as string);
            summary.events += 1;
          }
        }

        // 3. Chains → insert chain + ordered member rows.
        const chains: CausalChain[] = buildCausalChains(events, input);
        for (const chain of chains) {
          const { data: chainRow, error: cerr } = await client
            .from('hsin_causal_chains')
            .insert({
              narrative_id: chain.narrativeId,
              chain_name: chain.chainName,
              confidence: chain.confidence,
              summary: chain.summary,
            })
            .select('id')
            .single();
          if (cerr || !chainRow?.id) continue;
          const chainId = chainRow.id as string;
          summary.chains += 1;

          let seq = 0;
          for (const ev of chain.events) {
            const engineId =
              ev.id ?? `evt_${ev.narrativeId}_${ev.eventType}_${ev.occurredAt}`;
            const eventId = persistedEventId.get(engineId);
            if (!eventId) continue; // event insert failed; skip the slot.
            await client.from('hsin_causal_chain_events').insert({
              chain_id: chainId,
              event_id: eventId,
              sequence_order: seq,
            });
            seq += 1;
          }
        }

        // 4. Replay frames → upsert (unique narrative_id + frame_timestamp).
        const frames: ReplayFrame[] = buildReplayFrames(input, 'weekly');
        for (const f of frames) {
          const frameData: JsonRecord = {
            signals: f.signals,
            sources: f.sources,
            communities: f.communities,
            amplification: f.amplification,
            reliability: f.reliability,
            influenceIn: f.influenceIn,
            influenceOut: f.influenceOut,
            forecast: f.forecast ?? null,
            changeType: f.changeType ?? null,
            events: f.events,
            ...toJson(f.data),
          };
          const { data: existing } = await client
            .from('hsin_replay_frames')
            .select('id')
            .eq('narrative_id', f.narrativeId)
            .eq('frame_timestamp', f.frameTimestamp)
            .maybeSingle();
          if (existing?.id) {
            const { error } = await client
              .from('hsin_replay_frames')
              .update({ frame_data: frameData })
              .eq('id', existing.id as string);
            if (!error) summary.replayFrames += 1;
          } else {
            const { error } = await client.from('hsin_replay_frames').insert({
              narrative_id: f.narrativeId,
              frame_timestamp: f.frameTimestamp,
              frame_data: frameData,
            });
            if (!error) summary.replayFrames += 1;
          }
        }

        // 5. Milestones → insert.
        const milestones: NarrativeMilestone[] = detectNarrativeMilestones(
          input,
          events,
        );
        for (const m of milestones) {
          const { error } = await client
            .from('hsin_narrative_milestones')
            .insert({
              narrative_id: m.narrativeId,
              milestone_type: asMilestoneType(m.milestoneType),
              confidence: m.confidence,
              description: m.description,
              metrics_json: toJson(m.metrics),
              occurred_at: m.occurredAt,
            });
          if (!error) summary.milestones += 1;
        }
      } catch (e) {
        logError('causal/persistence:rebuild-narrative', e);
      }
    }

    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

// =============================================================================
// DEMO — labeled, NON-PERSISTED view-models from the package causalDemo().
// For the NOT_CONFIGURED / empty-env showcase path. NEVER throws.
// =============================================================================

export interface CausalDemoViews {
  causal: CausalView;
  highlights: CausalHighlights;
  replayByNarrative: Record<string, ReplayView>;
  milestones: MilestonesView;
  explanations: CausalExplanation[];
  timelines: WorldforgeTimeline[];
}

/**
 * Build the Phase-11 view-models from the deterministic engine fixtures
 * (causalDemo). Synthetic ids; clearly a demo. The UI renders this when Supabase
 * is not configured. NEVER throws (causalDemo is pure/offline).
 */
export async function demoCausal(): Promise<DbResult<CausalDemoViews>> {
  try {
    const demo = causalDemo();
    const now = demo.now;

    const narratives: HsinNarrativeRecord[] = demo.narratives.map((n) => ({
      id: n.narrativeId,
      name: n.narrativeId,
      created_at: now,
      updated_at: now,
    }));

    // Events (flattened across narratives).
    const allEvents: HsinCausalEventRecord[] = [];
    for (const n of demo.narratives) {
      for (const e of n.events) allEvents.push(eventToRecord(e, now));
    }

    // Chains (with their member events resolved from the engine chain).
    const chains: (HsinCausalChainRecord & {
      events: HsinCausalEventRecord[];
    })[] = [];
    for (const n of demo.narratives) {
      for (let i = 0; i < n.chains.length; i += 1) {
        const c = n.chains[i];
        const events = c.events.map((e) => eventToRecord(e, now));
        chains.push({
          id: c.id ?? `demo-chain-${n.narrativeId}-${i}`,
          narrative_id: c.narrativeId,
          chain_name: c.chainName,
          confidence: c.confidence,
          summary: c.summary,
          created_at: now,
          updated_at: now,
          events,
        });
      }
    }

    const causal: CausalView = { narratives, events: allEvents, chains };

    // Milestones (flattened).
    const allMilestones: HsinNarrativeMilestoneRecord[] = [];
    for (const n of demo.narratives) {
      for (const m of n.milestones) allMilestones.push(milestoneToRecord(m, now));
    }
    const milestones: MilestonesView = { narratives, milestones: allMilestones };

    // Replay frames per narrative.
    const replayByNarrative: Record<string, ReplayView> = {};
    for (const n of demo.narratives) {
      const frames: HsinReplayFrameRecord[] = n.replay.map((f, i) => ({
        id: `demo-frame-${n.narrativeId}-${i}`,
        narrative_id: f.narrativeId,
        frame_timestamp: f.frameTimestamp,
        frame_data: {
          signals: f.signals,
          sources: f.sources,
          communities: f.communities,
          amplification: f.amplification,
          reliability: f.reliability,
          influenceIn: f.influenceIn,
          influenceOut: f.influenceOut,
          forecast: f.forecast ?? null,
          changeType: f.changeType ?? null,
          events: f.events,
          ...toJson(f.data),
        },
        created_at: now,
      }));
      const narrative = narratives.find((x) => x.id === n.narrativeId) ?? null;
      const ms = allMilestones.filter((m) => m.narrative_id === n.narrativeId);
      replayByNarrative[n.narrativeId] = { narrative, frames, milestones: ms };
    }

    // Explanations + timelines.
    const explanations: CausalExplanation[] = demo.narratives.map((n) => ({
      narrativeId: n.explanation.narrativeId,
      headline: n.explanation.headline,
      text: n.explanation.text,
      factors: n.explanation.factors.map((f) => ({
        label: f.label,
        detail: f.detail,
        metric: f.metric,
      })),
      confidence: n.explanation.confidence,
      generatedAt: n.explanation.generatedAt,
    }));

    const timelines: WorldforgeTimeline[] = demo.narratives.map((n) => {
      const turningPoints = n.milestones
        .filter((m) => !!m.occurredAt)
        .map((m) => ({
          at: m.occurredAt,
          milestoneType: m.milestoneType,
          description: m.description,
        }));
      const seeds = [...n.events]
        .sort((a, b) => b.eventStrength - a.eventStrength)
        .slice(0, 5)
        .map((e) => ({
          prompt: `What if the ${e.eventType.replace(/_/g, ' ')} on ${e.occurredAt.slice(
            0,
            10,
          )} never occurred?`,
          basis: e.explanation,
        }));
      const replay = n.replay;
      const epochs: WorldforgeTimeline['epochs'] =
        replay.length > 0
          ? [
              {
                label: 'Full history',
                startAt: replay[0].frameTimestamp,
                endAt: replay[replay.length - 1].frameTimestamp,
                summary: `${replay.length} frames; signals ${replay[0].signals}→${
                  replay[replay.length - 1].signals
                }`,
              },
            ]
          : [];
      return {
        narrativeId: n.narrativeId,
        epochs,
        turningPoints,
        counterfactualSeeds: seeds,
      };
    });

    // Highlights derived from the demo events the same way getCausalHighlights does.
    const nameById = new Map(narratives.map((n) => [n.id, n.name]));
    const nameOf = (id?: string): string => (id && nameById.get(id)) || id || 'unknown';
    const highlights: CausalHighlights = {};
    {
      let bestSig: HsinCausalEventRecord | null = null;
      let bestGrowth: { id: string; pct: number } | null = null;
      let bestForecast: HsinCausalEventRecord | null = null;
      let bestAmp: HsinCausalEventRecord | null = null;
      let bestComm: HsinCausalEventRecord | null = null;
      const impact = (e: HsinCausalEventRecord): number =>
        (e.event_strength ?? 0) * (e.confidence ?? 0);
      for (const e of allEvents) {
        if (!bestSig || impact(e) > impact(bestSig)) bestSig = e;
        if (e.event_type === 'signal_surge') {
          const pct = numFrom(e.metrics_json, 'deltaPct');
          if (pct !== undefined && (!bestGrowth || pct > bestGrowth.pct)) {
            bestGrowth = { id: e.narrative_id, pct };
          }
        }
        if (
          e.event_type === 'forecast_shift' &&
          (!bestForecast || (e.event_strength ?? 0) > (bestForecast.event_strength ?? 0))
        ) {
          bestForecast = e;
        }
        if (
          e.event_type === 'amplification_spike' &&
          (!bestAmp || (e.event_strength ?? 0) > (bestAmp.event_strength ?? 0))
        ) {
          bestAmp = e;
        }
        if (
          e.event_type === 'community_growth' &&
          (!bestComm || (e.event_strength ?? 0) > (bestComm.event_strength ?? 0))
        ) {
          bestComm = e;
        }
      }
      if (bestSig) {
        highlights.mostSignificantEvent = {
          narrativeId: bestSig.narrative_id,
          name: nameOf(bestSig.narrative_id),
          eventType: bestSig.event_type,
          eventStrength: bestSig.event_strength ?? 0,
        };
      }
      if (bestGrowth) {
        highlights.fastestGrowth = {
          narrativeId: bestGrowth.id,
          name: nameOf(bestGrowth.id),
          growthPct: bestGrowth.pct,
        };
      }
      if (bestForecast) {
        const from = strFrom(bestForecast.metrics_json, 'fromState');
        const to = strFrom(bestForecast.metrics_json, 'toState');
        highlights.largestForecastShift = {
          narrativeId: bestForecast.narrative_id,
          name: nameOf(bestForecast.narrative_id),
          detail: from && to ? `${from} → ${to}` : bestForecast.explanation ?? 'shift',
        };
      }
      if (bestAmp) {
        highlights.largestAmplificationSpike = {
          narrativeId: bestAmp.narrative_id,
          name: nameOf(bestAmp.narrative_id),
          eventStrength: bestAmp.event_strength ?? 0,
        };
      }
      if (bestComm) {
        highlights.mostImportantCommunityExpansion = {
          narrativeId: bestComm.narrative_id,
          name: nameOf(bestComm.narrative_id),
          eventStrength: bestComm.event_strength ?? 0,
        };
      }
    }

    return {
      ok: true,
      data: {
        causal,
        highlights,
        replayByNarrative,
        milestones,
        explanations,
        timelines,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

// -----------------------------------------------------------------------------
// Re-export the shared client accessor + role helper for the actions layer.
// -----------------------------------------------------------------------------
export { db as causalDbClient, requireRole as requireCausalRole };
