// =============================================================================
// apps/worker/jobs — causalWorkerJob (WorldForge/HSI Phase 11)
//
// "Why did it change?" The daily CAUSAL pipeline. Where the Phase-10 temporal
// worker is "git history for ideas," this worker EXPLAINS that history by
// running the pure @hsi/causal-intelligence engine over each narrative's
// temporal timeline in four staged steps, each independently fault-isolated (a
// stage failure logs + continues — the worker NEVER throws fatally):
//
//   1. EVENTS     — detectCausalEvents(input): threshold-gated causal events
//                   (signal_surge / source_expansion / community_growth /
//                   amplification_spike / contradiction_drop|rise /
//                   forecast_shift / influence_transfer) across the history.
//   2. CHAINS     — buildCausalChains(events, input): canonical Growth/Decline
//                   cause chains, ordered by causal precedence, summarising the
//                   ACTUAL member events.
//   3. REPLAY     — buildReplayFrames(input, cadence): one frame per (resampled)
//                   snapshot — the narrative state + active event types +
//                   forecast + change type, for the UI scrubber.
//   4. MILESTONES — detectNarrativeMilestones(input, events): life-cycle
//                   milestones (birth → growth → viral → peak → decline → death
//                   → resurgence).
//
// PURITY: the engine is pure & deterministic. The job derives a single `now`
// (ctx.runAt) and a single replay cadence and INJECTS them — it NEVER calls
// Date.now() inside the engine. No network, no keys.
//
// OFFLINE-SAFE (binding): the per-narrative CausalInput bundle is read via an
// INJECTED loader and the four output sets are written via an INJECTED
// persister. The DEFAULT loader/persister operate on the service-role Supabase
// (the Phase-10 hsin_narrative_* temporal tables → read; the Phase-11
// hsin_causal_* / hsin_replay_frames / hsin_narrative_milestones tables →
// write) WHEN the service-role env is configured; otherwise they degrade to the
// DEMO_CAUSAL_INPUTS fixtures (loader) and a no-op (persister), and the computed
// outputs are just logged. Empty env → a clean, deterministic fixtures run.
// NEVER throws.
//
// GOVERNANCE: this worker only DETECTS/RECOMPUTES the causal + replay layer. It
// NEVER auto-publishes a narrative, never decides a review, never asserts truth
// — every event/chain/milestone is a triage aid for a HUMAN reviewer. An
// audit_logs event ('causal.pipeline') is appended when the DB is configured.
//
// ICM: declared INPUTS (narrativeCount, snapshotCount, eventCadence, mode) and
// OUTPUTS (events/chains/replayFrames/milestones counts) are logged.
//
// SCHEDULING: cron '0 4 * * *' (daily 04:00 UTC) — AFTER the Phase-10 temporal
// worker (03:00) so the temporal tables it reads are fresh. Driven by an
// external scheduler; the worker has no internal scheduler.
// =============================================================================

import {
  buildCausalChains,
  buildReplayFrames,
  detectCausalEvents,
  detectNarrativeMilestones,
  DEMO_CAUSAL_INPUTS,
  type CausalChain as CausalChainResult,
  type CausalEvent as CausalEventResult,
  type CausalInput as CausalInputBundle,
  type EvolutionRecord as CausalEvolutionRecord,
  type InfluenceEdge as CausalInfluenceEdge,
  type NarrativeForecast as CausalNarrativeForecast,
  type NarrativeMilestone as CausalMilestone,
  type NarrativeSnapshot as CausalNarrativeSnapshot,
  type ReplayFrame as CausalReplayFrame,
} from '@hsi/causal-intelligence';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** The replay cadence used to resample frames. */
export type CausalReplayCadence = 'daily' | 'weekly' | 'monthly';

/** Default replay cadence when the env does not override it. */
export const DEFAULT_CAUSAL_REPLAY_CADENCE: CausalReplayCadence = 'weekly';

/** The per-narrative causal inputs the engine operates on for one run. */
export interface CausalWorld {
  inputs: CausalInputBundle[];
}

/** The full set of computed outputs handed to the persister. */
export interface CausalOutputs {
  events: CausalEventResult[];
  chains: CausalChainResult[];
  replayFrames: CausalReplayFrame[];
  milestones: CausalMilestone[];
}

/** Best-effort report of which output sets were persisted (for the summary). */
export interface CausalPersistResult {
  events: number;
  chains: number;
  chainEvents: number;
  replayFrames: number;
  milestones: number;
  audited: boolean;
}

/** Loads the per-narrative causal inputs (default: DB when configured, else fixtures). */
export type LoadCausalWorld = (ctx: JobContext) => Promise<CausalWorld>;

/** Persists the computed causal outputs (default: DB when configured, else no-op). */
export type PersistCausalOutputs = (
  outputs: CausalOutputs,
  ctx: JobContext,
) => Promise<CausalPersistResult>;

const EMPTY_PERSIST: CausalPersistResult = {
  events: 0,
  chains: 0,
  chainEvents: 0,
  replayFrames: 0,
  milestones: 0,
  audited: false,
};

/** Resolve the replay cadence from the env (offline-safe; defaults to weekly). */
function cadenceFromEnv(env: NodeJS.ProcessEnv = process.env): CausalReplayCadence {
  const raw = (env.CAUSAL_REPLAY_CADENCE || '').toLowerCase();
  if (raw === 'daily' || raw === 'weekly' || raw === 'monthly') return raw;
  return DEFAULT_CAUSAL_REPLAY_CADENCE;
}

export function makeCausalWorkerJob(
  load: LoadCausalWorld = defaultLoadCausalWorld,
  persist: PersistCausalOutputs = defaultPersistCausalOutputs,
): Job {
  return {
    name: 'causal',
    description:
      'Daily causal pipeline: events → chains → replay frames → milestones (never auto-publishes).',
    schedule: '0 4 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      // Deterministic clock + cadence are injected into the pure engine. We
      // NEVER call Date.now() inside the engine — `now` flows from the context.
      const now = ctx.runAt;
      const cadence = cadenceFromEnv();
      const offline = !causalServiceRoleConfigured();

      // ---- Load the world (loader failure → empty, never fatal) --------------
      let world: CausalWorld = { inputs: [] };
      try {
        world = await load(ctx);
      } catch (e) {
        logger.warn('job.causal.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Pin the injected `now` onto every input so the engine stays deterministic.
      const inputs: CausalInputBundle[] = world.inputs.map((i) => ({ ...i, now }));

      const snapshotCount = inputs.reduce((acc, i) => acc + i.snapshots.length, 0);
      const declaredInputs = {
        narrativeCount: inputs.length,
        snapshotCount,
        eventCadence: cadence,
        mode: offline ? 'offline-fixtures-or-noop' : 'db',
        runAt: now,
        // BINDING: the causal worker only detects/recomputes — never publishes.
        autoPublish: false,
      };
      logger.info('job.causal.start', { declaredInputs });

      const outputs: CausalOutputs = {
        events: [],
        chains: [],
        replayFrames: [],
        milestones: [],
      };
      const stageErrors: Record<string, string> = {};

      // ---- Stage 1: EVENTS (per-narrative, fault-isolated) -------------------
      // Events feed chains + milestones, so we keep them grouped per narrative.
      const eventsByNarrative = new Map<string, CausalEventResult[]>();
      try {
        for (const input of inputs) {
          try {
            const detected = detectCausalEvents(input);
            eventsByNarrative.set(input.narrativeId, detected);
            outputs.events.push(...detected);
          } catch (e) {
            logger.warn('job.causal.events.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
            eventsByNarrative.set(input.narrativeId, []);
          }
        }
        logger.info('job.causal.events', { events: outputs.events.length });
      } catch (e) {
        stageErrors.events = e instanceof Error ? e.message : String(e);
        logger.warn('job.causal.eventsFailed', { error: stageErrors.events });
      }

      // ---- Stage 2: CHAINS (ordered causal chains per narrative) -------------
      try {
        for (const input of inputs) {
          const events = eventsByNarrative.get(input.narrativeId) ?? [];
          try {
            outputs.chains.push(...buildCausalChains(events, input));
          } catch (e) {
            logger.warn('job.causal.chains.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.causal.chains', { chains: outputs.chains.length });
      } catch (e) {
        stageErrors.chains = e instanceof Error ? e.message : String(e);
        logger.warn('job.causal.chainsFailed', { error: stageErrors.chains });
      }

      // ---- Stage 3: REPLAY FRAMES (the scrubber timeline) --------------------
      try {
        for (const input of inputs) {
          try {
            outputs.replayFrames.push(...buildReplayFrames(input, cadence));
          } catch (e) {
            logger.warn('job.causal.replay.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.causal.replay', { replayFrames: outputs.replayFrames.length });
      } catch (e) {
        stageErrors.replay = e instanceof Error ? e.message : String(e);
        logger.warn('job.causal.replayFailed', { error: stageErrors.replay });
      }

      // ---- Stage 4: MILESTONES (life-cycle markers) --------------------------
      try {
        for (const input of inputs) {
          const events = eventsByNarrative.get(input.narrativeId) ?? [];
          try {
            outputs.milestones.push(...detectNarrativeMilestones(input, events));
          } catch (e) {
            logger.warn('job.causal.milestones.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.causal.milestones', { milestones: outputs.milestones.length });
      } catch (e) {
        stageErrors.milestones = e instanceof Error ? e.message : String(e);
        logger.warn('job.causal.milestonesFailed', { error: stageErrors.milestones });
      }

      // ---- Persist (best-effort; failure logs + continues) -------------------
      let persisted: CausalPersistResult = { ...EMPTY_PERSIST };
      try {
        persisted = await persist(outputs, ctx);
      } catch (e) {
        logger.warn('job.causal.persistFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const summary = {
        computed: {
          events: outputs.events.length,
          chains: outputs.chains.length,
          replayFrames: outputs.replayFrames.length,
          milestones: outputs.milestones.length,
        },
        persisted,
        stageErrors,
        autoPublished: false,
      };
      logger.info('job.causal.done', summary);

      return {
        job: 'causal',
        ok: true,
        declaredInputs,
        summary,
      };
    },
  };
}

// =============================================================================
// Service-role default loader/persister (offline-safe — null client → fixtures
// / no-op). The pure engine NEVER reads env; the worker resolves it here.
// =============================================================================

/** Minimal structural shape of the Supabase bits the causal worker uses. */
interface CausalSelectQuery {
  order: (col: string, opts?: { ascending?: boolean }) => CausalSelectQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
}
interface CausalClientLike {
  from(table: string): {
    select: (cols?: string) => CausalSelectQuery;
    insert: (
      values: unknown,
    ) => Promise<{ data: unknown; error: unknown }> & {
      select: (cols?: string) => Promise<{ data: unknown; error: unknown }>;
    };
    upsert: (
      values: unknown,
      opts?: { onConflict?: string },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

/** True when the service-role env is present (mirrors the temporal worker). */
function causalServiceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Resolve a service-role client, or null (offline). Never throws. */
function tryCausalClient(): CausalClientLike | null {
  if (!causalServiceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as CausalClientLike;
  } catch (e) {
    logger.warn('causal.serviceRole.unavailable', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

interface NarrativeIdRow {
  id: string;
}
interface SnapshotRow {
  id: string;
  narrative_id: string;
  captured_at: string;
  signal_count: number | null;
  source_count: number | null;
  community_count: number | null;
  amplification_score: number | null;
  reliability_score: number | null;
  support_ratio: number | null;
  contradiction_ratio: number | null;
  metadata: Record<string, unknown> | null;
}
interface EvolutionRow {
  id: string;
  narrative_id: string;
  change_type: string;
  growth_pct: number | null;
  confidence: number | null;
  metrics_json: Record<string, unknown> | null;
  reasoning_json: unknown;
  created_at: string;
}
interface InfluenceRow {
  source_narrative_id: string;
  target_narrative_id: string;
  influence_score: number | null;
  shared_entities: number | null;
  shared_sources: number | null;
  shared_communities: number | null;
  rationale: string | null;
  created_at: string | null;
}
interface ForecastRow {
  narrative_id: string;
  forecast_type: string;
  probability: number | null;
  reasoning: unknown;
  distribution_json: Record<string, number> | null;
  generated_at: string | null;
}

function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [];
}

/**
 * Default loader: assemble one CausalInput per narrative from the Phase-10
 * temporal tables (hsin_narrative_snapshots / hsin_narrative_evolution /
 * hsin_narrative_influence / hsin_narrative_forecasts) when the service-role
 * client is configured; otherwise fall back to the deterministic
 * DEMO_CAUSAL_INPUTS fixtures. Never throws.
 */
export const defaultLoadCausalWorld: LoadCausalWorld = async () => {
  const client = tryCausalClient();
  if (!client) {
    // OFFLINE: deterministic fixture inputs. Fully network-free.
    return { inputs: DEMO_CAUSAL_INPUTS };
  }
  try {
    const [narrRes, snapRes, evoRes, infRes, fcRes] = await Promise.all([
      client.from('hsin_narratives').select('id').limit(1000),
      client
        .from('hsin_narrative_snapshots')
        .select(
          'id,narrative_id,captured_at,signal_count,source_count,community_count,amplification_score,reliability_score,support_ratio,contradiction_ratio,metadata',
        )
        .order('captured_at', { ascending: true })
        .limit(20000),
      client
        .from('hsin_narrative_evolution')
        .select(
          'id,narrative_id,change_type,growth_pct,confidence,metrics_json,reasoning_json,created_at',
        )
        .order('created_at', { ascending: true })
        .limit(20000),
      client
        .from('hsin_narrative_influence')
        .select(
          'source_narrative_id,target_narrative_id,influence_score,shared_entities,shared_sources,shared_communities,rationale,created_at',
        )
        .limit(20000),
      client
        .from('hsin_narrative_forecasts')
        .select('narrative_id,forecast_type,probability,reasoning,distribution_json,generated_at')
        .order('generated_at', { ascending: true })
        .limit(20000),
    ]);

    const narrativeRows = (narrRes.error ? [] : (narrRes.data as NarrativeIdRow[])) ?? [];
    const snapshotRows = (snapRes.error ? [] : (snapRes.data as SnapshotRow[])) ?? [];
    const evolutionRows = (evoRes.error ? [] : (evoRes.data as EvolutionRow[])) ?? [];
    const influenceRows = (infRes.error ? [] : (infRes.data as InfluenceRow[])) ?? [];
    const forecastRows = (fcRes.error ? [] : (fcRes.data as ForecastRow[])) ?? [];

    // Group snapshots/evolution by narrative (insertion order = time order).
    const snapsByNarrative = new Map<string, CausalNarrativeSnapshot[]>();
    for (const r of snapshotRows) {
      const list = snapsByNarrative.get(r.narrative_id) ?? [];
      list.push({
        id: r.id,
        narrativeId: r.narrative_id,
        capturedAt: r.captured_at,
        signalCount: num(r.signal_count),
        sourceCount: num(r.source_count),
        communityCount: num(r.community_count),
        amplificationScore: num(r.amplification_score),
        reliabilityScore: num(r.reliability_score),
        supportRatio: num(r.support_ratio),
        contradictionRatio: num(r.contradiction_ratio),
        metadata: r.metadata ?? undefined,
      });
      snapsByNarrative.set(r.narrative_id, list);
    }

    const evoByNarrative = new Map<string, CausalEvolutionRecord[]>();
    for (const r of evolutionRows) {
      const m = (r.metrics_json ?? {}) as Record<string, unknown>;
      const list = evoByNarrative.get(r.narrative_id) ?? [];
      list.push({
        id: r.id,
        narrativeId: r.narrative_id,
        // parent/child snapshot ids are not persisted on the row; the causal
        // engine only reads narrativeId/changeType/growthPct/deltas/confidence.
        parentSnapshotId: '',
        childSnapshotId: '',
        changeType: r.change_type as CausalEvolutionRecord['changeType'],
        growthPct: num(r.growth_pct),
        amplificationDelta: num(m.amplificationDelta as number | undefined),
        communityDelta: num(m.communityDelta as number | undefined),
        sourceDelta: num(m.sourceDelta as number | undefined),
        reliabilityDelta: num(m.reliabilityDelta as number | undefined),
        contradictionDelta: num(m.contradictionDelta as number | undefined),
        confidence: num(r.confidence),
        reasoning: asStringArray(r.reasoning_json),
        createdAt: r.created_at,
      });
      evoByNarrative.set(r.narrative_id, list);
    }

    const inboundByNarrative = new Map<string, CausalInfluenceEdge[]>();
    const outboundByNarrative = new Map<string, CausalInfluenceEdge[]>();
    for (const r of influenceRows) {
      const edge: CausalInfluenceEdge = {
        sourceNarrativeId: r.source_narrative_id,
        targetNarrativeId: r.target_narrative_id,
        influenceScore: num(r.influence_score),
        sharedEntities: num(r.shared_entities),
        sharedSources: num(r.shared_sources),
        sharedCommunities: num(r.shared_communities),
        rationale: r.rationale ?? '',
        createdAt: r.created_at ?? '',
      };
      const inList = inboundByNarrative.get(r.target_narrative_id) ?? [];
      inList.push(edge);
      inboundByNarrative.set(r.target_narrative_id, inList);
      const outList = outboundByNarrative.get(r.source_narrative_id) ?? [];
      outList.push(edge);
      outboundByNarrative.set(r.source_narrative_id, outList);
    }

    // Keep only the latest forecast per narrative (rows are time-ordered asc).
    const forecastByNarrative = new Map<string, CausalNarrativeForecast>();
    for (const r of forecastRows) {
      forecastByNarrative.set(r.narrative_id, {
        narrativeId: r.narrative_id,
        forecastType: r.forecast_type as CausalNarrativeForecast['forecastType'],
        probability: num(r.probability),
        reasoning: asStringArray(r.reasoning),
        distribution: r.distribution_json ?? undefined,
        generatedAt: r.generated_at ?? '',
      });
    }

    // Build one input per narrative that actually has a snapshot history.
    const narrativeIds = new Set<string>();
    for (const r of narrativeRows) narrativeIds.add(r.id);
    for (const id of snapsByNarrative.keys()) narrativeIds.add(id);

    const inputs: CausalInputBundle[] = [];
    for (const narrativeId of narrativeIds) {
      const snapshots = snapsByNarrative.get(narrativeId) ?? [];
      if (snapshots.length === 0) continue; // nothing causal to explain
      inputs.push({
        narrativeId,
        snapshots,
        evolution: evoByNarrative.get(narrativeId) ?? [],
        influenceIn: inboundByNarrative.get(narrativeId),
        influenceOut: outboundByNarrative.get(narrativeId),
        forecast: forecastByNarrative.get(narrativeId),
        // `now` is re-pinned in run(); a placeholder keeps the bundle valid.
        now: '',
      });
    }

    return { inputs };
  } catch (e) {
    logger.warn('causal.dbLoad.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { inputs: [] };
  }
};

/**
 * Default persister: write the computed outputs to the Phase-11 hsin_* tables
 * when the service-role client is configured; otherwise a clean no-op (offline).
 * Each table write is best-effort and fault-isolated. Events are inserted first
 * (returning their ids) so chain membership (hsin_causal_chain_events) can link
 * back to the freshly inserted event rows by deterministic occurrence key.
 * Replay frames + milestones are upserted/inserted. NEVER auto-publishes — and
 * appends an audit_logs event. Never throws.
 */
export const defaultPersistCausalOutputs: PersistCausalOutputs = async (
  outputs,
  ctx,
) => {
  const client = tryCausalClient();
  if (!client) return { ...EMPTY_PERSIST };

  const at = ctx.runAt;
  const result: CausalPersistResult = { ...EMPTY_PERSIST };

  // Deterministic key for an event (narrative + type + time) so chain members
  // can be matched to their inserted DB row id.
  const eventKey = (e: { narrativeId: string; eventType: string; occurredAt: string }): string =>
    `${e.narrativeId}::${e.eventType}::${e.occurredAt}`;

  // (1) Events — append-only insert; capture inserted ids for chain linking.
  const eventIdByKey = new Map<string, string>();
  if (outputs.events.length > 0) {
    try {
      const rows = outputs.events.map((e) => ({
        narrative_id: e.narrativeId,
        event_type: e.eventType,
        event_strength: e.eventStrength,
        confidence: e.confidence,
        explanation: e.explanation,
        metrics_json: e.metrics,
        occurred_at: e.occurredAt,
      }));
      const { data, error } = await client
        .from('hsin_causal_events')
        .insert(rows)
        .select('id,narrative_id,event_type,occurred_at');
      if (!error) {
        result.events = rows.length;
        const inserted = (data as
          | { id: string; narrative_id: string; event_type: string; occurred_at: string }[]
          | null) ?? [];
        for (const r of inserted) {
          eventIdByKey.set(
            eventKey({
              narrativeId: r.narrative_id,
              eventType: r.event_type,
              occurredAt: r.occurred_at,
            }),
            r.id,
          );
        }
      } else {
        logger.warn('causal.persist.events.failed', { error: String(error) });
      }
    } catch (e) {
      logger.warn('causal.persist.events.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (2) Chains — insert each chain, then link its ordered member events.
  if (outputs.chains.length > 0) {
    for (const chain of outputs.chains) {
      try {
        const { data, error } = await client
          .from('hsin_causal_chains')
          .insert({
            narrative_id: chain.narrativeId,
            chain_name: chain.chainName,
            confidence: chain.confidence,
            summary: chain.summary,
          })
          .select('id');
        if (error) {
          logger.warn('causal.persist.chains.failed', {
            narrativeId: chain.narrativeId,
            error: String(error),
          });
          continue;
        }
        result.chains += 1;
        const chainRow = ((data as { id: string }[] | null) ?? [])[0];
        const chainId = chainRow?.id;
        if (!chainId || chain.events.length === 0) continue;

        // Link ordered member events (only those whose insert id we captured).
        const memberRows = chain.events
          .map((ev, idx) => {
            const eventId = eventIdByKey.get(eventKey(ev));
            return eventId
              ? { chain_id: chainId, event_id: eventId, sequence_order: idx }
              : null;
          })
          .filter((r): r is { chain_id: string; event_id: string; sequence_order: number } =>
            r !== null,
          );
        if (memberRows.length === 0) continue;
        const { error: linkErr } = await client
          .from('hsin_causal_chain_events')
          .insert(memberRows);
        if (!linkErr) result.chainEvents += memberRows.length;
        else
          logger.warn('causal.persist.chainEvents.failed', {
            chainId,
            error: String(linkErr),
          });
      } catch (e) {
        logger.warn('causal.persist.chains.threw', {
          narrativeId: chain.narrativeId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // (3) Replay frames — upsert on (narrative_id, frame_timestamp) (idempotent).
  if (outputs.replayFrames.length > 0) {
    try {
      const rows = outputs.replayFrames.map((f) => ({
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
          ...f.data,
        },
      }));
      const { error } = await client
        .from('hsin_replay_frames')
        .upsert(rows, { onConflict: 'narrative_id,frame_timestamp' });
      if (!error) result.replayFrames = rows.length;
      else logger.warn('causal.persist.replayFrames.failed', { error: String(error) });
    } catch (e) {
      logger.warn('causal.persist.replayFrames.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (4) Milestones — append-only insert.
  if (outputs.milestones.length > 0) {
    try {
      const rows = outputs.milestones.map((m) => ({
        narrative_id: m.narrativeId,
        milestone_type: m.milestoneType,
        confidence: m.confidence,
        description: m.description,
        metrics_json: m.metrics,
        occurred_at: m.occurredAt,
      }));
      const { error } = await client.from('hsin_narrative_milestones').insert(rows);
      if (!error) result.milestones = rows.length;
      else logger.warn('causal.persist.milestones.failed', { error: String(error) });
    } catch (e) {
      logger.warn('causal.persist.milestones.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (5) Audit — append-only audit_logs event. NEVER records a publish.
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: null,
      action: 'causal.pipeline',
      metadata: {
        events: result.events,
        chains: result.chains,
        chainEvents: result.chainEvents,
        replayFrames: result.replayFrames,
        milestones: result.milestones,
        at,
        autoPublished: false,
      },
    });
    result.audited = !error;
  } catch (e) {
    logger.warn('causal.persist.audit.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return result;
};

/**
 * The registered causal pipeline job. Uses the DB loader/persister by default;
 * both degrade to a clean fixtures-run / no-op offline (no service-role env), so
 * this is fully offline-safe and never throws fatally.
 */
export const causalWorkerJob: Job = makeCausalWorkerJob();
