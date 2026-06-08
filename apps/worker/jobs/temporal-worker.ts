// =============================================================================
// apps/worker/jobs — temporalWorkerJob (WorldForge/HSI Phase 10)
//
// "Git history for ideas." The daily TEMPORAL pipeline. It runs the pure
// @hsi/temporal-intelligence engine over the narrative-intelligence graph in
// five staged steps, each independently fault-isolated (a stage failure logs +
// continues — the worker NEVER throws fatally):
//
//   1. CAPTURE   — captureSnapshots(narratives, signals, now, cadence): freeze a
//                  point-in-time snapshot of every narrative ("a commit").
//   2. EVOLUTION — evolutionSeries(perNarrativeSnapshots, now): pairwise diffs of
//                  consecutive snapshots → typed change records (growth/decline/
//                  mutation/split/merge), per narrative.
//   3. GENEALOGY — buildNarrativeGenealogy(narratives, signals, deps): the
//                  directed "family tree" of derived_from/split_from/merged_from/
//                  contradicts/amplifies edges.
//   4. INFLUENCE — buildInfluenceNetwork(narratives, snapshots, signals, deps):
//                  directed, time-ordered influence edges (0..100).
//   5. FORECAST  — forecastNarrativeTrajectory(...): a PROBABILISTIC, explainable
//                  distribution over {emerging,rising,stable,declining,dead} per
//                  narrative. Never a certainty; thin data widens the spread.
//
// PURITY: the engine is pure & deterministic. The job derives a single `now`
// (ctx.runAt) and a single cadence and INJECTS them — it NEVER calls Date.now()
// inside the engine. Embeddings are injected via createEmbedder({ local: true })
// (@hsi/source-intelligence) so genealogy similarity is fully offline (no OpenAI).
//
// OFFLINE-SAFE (binding): narratives/signals/snapshots are read via an INJECTED
// loader and the five output sets are written via an INJECTED persister. The
// DEFAULT loader/persister operate on the service-role Supabase (hsin_* tables)
// WHEN the service-role env is configured; otherwise they degrade to the DEMO_*
// fixtures (loader) and a no-op (persister), and the computed outputs are just
// logged. Empty env → a clean, deterministic fixture run. NEVER throws.
//
// GOVERNANCE: this worker only CAPTURES/RECOMPUTES the temporal layer. It NEVER
// auto-publishes a narrative, never decides a review, never asserts truth — every
// forecast is a triage aid for a HUMAN reviewer. An audit_logs event is appended
// when the DB is configured.
//
// ICM: declared INPUTS (narrativeCount, signalCount, snapshotCount, cadence,
// embedMethod, mode) and OUTPUTS (snapshots/evolution/genealogy/influence/
// forecasts counts) are logged.
//
// SCHEDULING: cron '0 3 * * *' (daily 03:00 UTC) via an external scheduler — the
// worker has no internal scheduler.
// =============================================================================

import {
  buildInfluenceNetwork,
  buildNarrativeGenealogy,
  captureSnapshots,
  evolutionSeries,
  forecastNarrativeTrajectory,
  DEMO_NARRATIVES,
  DEMO_SIGNALS,
  DEMO_SNAPSHOTS,
  type EvolutionRecord as TemporalEvolutionRecord,
  type GenealogyEdge as TemporalGenealogyEdge,
  type InfluenceEdge as TemporalInfluenceEdge,
  type NarrativeForecast as TemporalNarrativeForecast,
  type NarrativeInput as TemporalNarrativeInput,
  type NarrativeSnapshot as TemporalNarrativeSnapshot,
  type SignalInput as TemporalSignalInput,
  type SnapshotCadence as TemporalSnapshotCadence,
  type TemporalDeps,
} from '@hsi/temporal-intelligence';
import { createEmbedder } from '@hsi/source-intelligence';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** Default snapshot cadence when the env does not override it. */
export const DEFAULT_TEMPORAL_CADENCE: TemporalSnapshotCadence = 'daily';

/** The narrative graph the temporal engine operates on for one run. */
export interface TemporalWorld {
  narratives: TemporalNarrativeInput[];
  signals: TemporalSignalInput[];
  /** Prior snapshots (for evolution/forecast history). May be empty. */
  priorSnapshots: TemporalNarrativeSnapshot[];
}

/** The full set of computed outputs handed to the persister. */
export interface TemporalOutputs {
  snapshots: TemporalNarrativeSnapshot[];
  evolution: TemporalEvolutionRecord[];
  genealogy: TemporalGenealogyEdge[];
  influence: TemporalInfluenceEdge[];
  forecasts: TemporalNarrativeForecast[];
}

/** Best-effort report of which output sets were persisted (for the summary). */
export interface TemporalPersistResult {
  snapshots: number;
  evolution: number;
  genealogy: number;
  influence: number;
  forecasts: number;
  audited: boolean;
}

/** Loads the narrative graph for a run (default: DB when configured, else fixtures). */
export type LoadTemporalWorld = (ctx: JobContext) => Promise<TemporalWorld>;

/** Persists the computed temporal outputs (default: DB when configured, else no-op). */
export type PersistTemporalOutputs = (
  outputs: TemporalOutputs,
  ctx: JobContext,
) => Promise<TemporalPersistResult>;

const EMPTY_PERSIST: TemporalPersistResult = {
  snapshots: 0,
  evolution: 0,
  genealogy: 0,
  influence: 0,
  forecasts: 0,
  audited: false,
};

/** Resolve the snapshot cadence from the env (offline-safe; defaults to daily). */
function cadenceFromEnv(env: NodeJS.ProcessEnv = process.env): TemporalSnapshotCadence {
  const raw = (env.TEMPORAL_SNAPSHOT_CADENCE || '').toLowerCase();
  if (raw === 'weekly' || raw === 'monthly' || raw === 'daily') return raw;
  return DEFAULT_TEMPORAL_CADENCE;
}

/** Group snapshots by narrative id (stable insertion order preserved). */
function groupSnapshotsByNarrative(
  snapshots: TemporalNarrativeSnapshot[],
): Map<string, TemporalNarrativeSnapshot[]> {
  const byNarrative = new Map<string, TemporalNarrativeSnapshot[]>();
  for (const s of snapshots) {
    const list = byNarrative.get(s.narrativeId) ?? [];
    list.push(s);
    byNarrative.set(s.narrativeId, list);
  }
  return byNarrative;
}

export function makeTemporalWorkerJob(
  load: LoadTemporalWorld = defaultLoadTemporalWorld,
  persist: PersistTemporalOutputs = defaultPersistTemporalOutputs,
): Job {
  return {
    name: 'temporal',
    description:
      'Daily temporal pipeline: snapshots → evolution → genealogy → influence → forecasts (never auto-publishes).',
    schedule: '0 3 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      // Deterministic clock + cadence are injected into the pure engine. We NEVER
      // call Date.now() inside the engine — `now` flows from the job context.
      const now = ctx.runAt;
      const cadence = cadenceFromEnv();
      const offline = !temporalServiceRoleConfigured();

      // OFFLINE-SAFE embeddings: force the local lexical embedder (no OpenAI key
      // required) so genealogy similarity is deterministic and network-free.
      const embedder = createEmbedder({ local: true });
      const deps: TemporalDeps = { now, embed: (texts) => embedder.embed(texts) };

      // ---- Load the world (loader failure → empty, never fatal) --------------
      let world: TemporalWorld = { narratives: [], signals: [], priorSnapshots: [] };
      try {
        world = await load(ctx);
      } catch (e) {
        logger.warn('job.temporal.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const declaredInputs = {
        narrativeCount: world.narratives.length,
        signalCount: world.signals.length,
        priorSnapshotCount: world.priorSnapshots.length,
        cadence,
        embedMethod: embedder.method,
        mode: offline ? 'offline-fixtures-or-noop' : 'db',
        runAt: now,
        // BINDING: the temporal worker only captures/recomputes — never publishes.
        autoPublish: false,
      };
      logger.info('job.temporal.start', { declaredInputs });

      const outputs: TemporalOutputs = {
        snapshots: [],
        evolution: [],
        genealogy: [],
        influence: [],
        forecasts: [],
      };
      const stageErrors: Record<string, string> = {};

      // ---- Stage 1: CAPTURE snapshots ---------------------------------------
      try {
        outputs.snapshots = captureSnapshots(
          world.narratives,
          world.signals,
          now,
          cadence,
        );
        logger.info('job.temporal.capture', { snapshots: outputs.snapshots.length });
      } catch (e) {
        stageErrors.capture = e instanceof Error ? e.message : String(e);
        logger.warn('job.temporal.captureFailed', { error: stageErrors.capture });
      }

      // The evolution/forecast history is prior snapshots + the freshly captured
      // ones, grouped per narrative.
      const historyByNarrative = groupSnapshotsByNarrative([
        ...world.priorSnapshots,
        ...outputs.snapshots,
      ]);

      // ---- Stage 2: EVOLUTION (pairwise diffs per narrative) -----------------
      try {
        for (const [narrativeId, snaps] of historyByNarrative) {
          if (snaps.length < 2) continue;
          try {
            outputs.evolution.push(...evolutionSeries(snaps, now));
          } catch (e) {
            logger.warn('job.temporal.evolution.narrativeFailed', {
              narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.temporal.evolution', { evolution: outputs.evolution.length });
      } catch (e) {
        stageErrors.evolution = e instanceof Error ? e.message : String(e);
        logger.warn('job.temporal.evolutionFailed', { error: stageErrors.evolution });
      }

      // ---- Stage 3: GENEALOGY (cross-narrative lineage edges) ----------------
      try {
        outputs.genealogy = await buildNarrativeGenealogy(
          world.narratives,
          world.signals,
          deps,
        );
        logger.info('job.temporal.genealogy', { genealogy: outputs.genealogy.length });
      } catch (e) {
        stageErrors.genealogy = e instanceof Error ? e.message : String(e);
        logger.warn('job.temporal.genealogyFailed', { error: stageErrors.genealogy });
      }

      // ---- Stage 4: INFLUENCE (directed, time-ordered influence edges) -------
      try {
        outputs.influence = buildInfluenceNetwork(
          world.narratives,
          [...world.priorSnapshots, ...outputs.snapshots],
          world.signals,
          deps,
        );
        logger.info('job.temporal.influence', { influence: outputs.influence.length });
      } catch (e) {
        stageErrors.influence = e instanceof Error ? e.message : String(e);
        logger.warn('job.temporal.influenceFailed', { error: stageErrors.influence });
      }

      // ---- Stage 5: FORECAST (probabilistic per-narrative trajectories) ------
      try {
        for (const n of world.narratives) {
          const snaps = historyByNarrative.get(n.id) ?? [];
          const series = outputs.evolution.filter((e) => e.narrativeId === n.id);
          try {
            outputs.forecasts.push(
              forecastNarrativeTrajectory({
                narrativeId: n.id,
                snapshots: snaps,
                evolution: series,
                now,
              }),
            );
          } catch (e) {
            logger.warn('job.temporal.forecast.narrativeFailed', {
              narrativeId: n.id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.temporal.forecast', { forecasts: outputs.forecasts.length });
      } catch (e) {
        stageErrors.forecast = e instanceof Error ? e.message : String(e);
        logger.warn('job.temporal.forecastFailed', { error: stageErrors.forecast });
      }

      // ---- Persist (best-effort; failure logs + continues) -------------------
      let persisted: TemporalPersistResult = { ...EMPTY_PERSIST };
      try {
        persisted = await persist(outputs, ctx);
      } catch (e) {
        logger.warn('job.temporal.persistFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const summary = {
        computed: {
          snapshots: outputs.snapshots.length,
          evolution: outputs.evolution.length,
          genealogy: outputs.genealogy.length,
          influence: outputs.influence.length,
          forecasts: outputs.forecasts.length,
        },
        persisted,
        stageErrors,
        autoPublished: false,
      };
      logger.info('job.temporal.done', summary);

      return {
        job: 'temporal',
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

/** Minimal structural shape of the Supabase bits the temporal worker uses. */
interface TemporalQuery {
  select: (cols?: string) => TemporalQuery;
  order: (col: string, opts?: { ascending?: boolean }) => TemporalQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
}
interface TemporalClientLike {
  from(table: string): {
    select: (cols?: string) => TemporalQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
    upsert: (
      values: unknown,
      opts?: { onConflict?: string },
    ) => Promise<{ data: unknown; error: unknown }>;
  };
}

/** True when the service-role env is present (mirrors the other workers). */
function temporalServiceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Resolve a service-role client, or null (offline). Never throws. */
function tryTemporalClient(): TemporalClientLike | null {
  if (!temporalServiceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as TemporalClientLike;
  } catch (e) {
    logger.warn('temporal.serviceRole.unavailable', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

interface NarrativeRow {
  id: string;
  name: string | null;
  category: string | null;
}
interface SignalNarrativeRow {
  signal_id: string;
  narrative_id: string;
}
interface SignalRow {
  id: string;
  source_id: string | null;
  title: string | null;
  summary: string | null;
  captured_at: string | null;
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

function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Default loader: read narratives + signal↔narrative links + signals + prior
 * snapshots from the hsin_* tables when the service-role client is configured;
 * otherwise fall back to the deterministic DEMO_* fixtures. Never throws.
 */
export const defaultLoadTemporalWorld: LoadTemporalWorld = async () => {
  const client = tryTemporalClient();
  if (!client) {
    // OFFLINE: deterministic fixture world (snapshots become evolution/forecast
    // history). Fully network-free.
    return {
      narratives: DEMO_NARRATIVES,
      signals: DEMO_SIGNALS,
      priorSnapshots: DEMO_SNAPSHOTS,
    };
  }
  try {
    const [nRes, snRes, sRes, snapRes] = await Promise.all([
      client.from('hsin_narratives').select('id,name,category').limit(1000),
      client.from('hsin_signal_narratives').select('signal_id,narrative_id').limit(20000),
      client
        .from('hsin_signals')
        .select('id,source_id,title,summary,captured_at')
        .limit(20000),
      client
        .from('hsin_narrative_snapshots')
        .select(
          'id,narrative_id,captured_at,signal_count,source_count,community_count,amplification_score,reliability_score,support_ratio,contradiction_ratio,metadata',
        )
        .order('captured_at', { ascending: true })
        .limit(20000),
    ]);

    const narrativeRows = (nRes.error ? [] : (nRes.data as NarrativeRow[])) ?? [];
    const linkRows = (snRes.error ? [] : (snRes.data as SignalNarrativeRow[])) ?? [];
    const signalRows = (sRes.error ? [] : (sRes.data as SignalRow[])) ?? [];
    const snapshotRows = (snapRes.error ? [] : (snapRes.data as SnapshotRow[])) ?? [];

    // Map narrative → its signal ids.
    const signalIdsByNarrative = new Map<string, string[]>();
    for (const l of linkRows) {
      const arr = signalIdsByNarrative.get(l.narrative_id) ?? [];
      arr.push(l.signal_id);
      signalIdsByNarrative.set(l.narrative_id, arr);
    }
    const narrativeBySignal = new Map<string, string>();
    for (const l of linkRows) narrativeBySignal.set(l.signal_id, l.narrative_id);

    const narratives: TemporalNarrativeInput[] = narrativeRows.map((r) => ({
      id: r.id,
      name: r.name ?? r.id,
      category: r.category ?? undefined,
      signalIds: signalIdsByNarrative.get(r.id) ?? [],
    }));

    const signals: TemporalSignalInput[] = signalRows.map((r) => ({
      id: r.id,
      narrativeId: narrativeBySignal.get(r.id),
      sourceId: r.source_id ?? undefined,
      capturedAt: r.captured_at ?? undefined,
      title: r.title ?? undefined,
      bodyText: r.summary ?? r.title ?? undefined,
    }));

    const priorSnapshots: TemporalNarrativeSnapshot[] = snapshotRows.map((r) => ({
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
    }));

    return { narratives, signals, priorSnapshots };
  } catch (e) {
    logger.warn('temporal.dbLoad.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { narratives: [], signals: [], priorSnapshots: [] };
  }
};

/**
 * Default persister: write the computed outputs to the hsin_* Phase-10 tables
 * when the service-role client is configured; otherwise a clean no-op (offline).
 * Each table write is best-effort and fault-isolated. NEVER auto-publishes — it
 * only inserts snapshots/evolution/forecasts and upserts genealogy/influence
 * edges — and appends an audit_logs event. Never throws.
 */
export const defaultPersistTemporalOutputs: PersistTemporalOutputs = async (
  outputs,
  ctx,
) => {
  const client = tryTemporalClient();
  if (!client) return { ...EMPTY_PERSIST };

  const at = ctx.runAt;
  const result: TemporalPersistResult = { ...EMPTY_PERSIST };

  // (1) Snapshots — append-only insert.
  if (outputs.snapshots.length > 0) {
    try {
      const rows = outputs.snapshots.map((s) => ({
        narrative_id: s.narrativeId,
        captured_at: s.capturedAt,
        signal_count: s.signalCount,
        source_count: s.sourceCount,
        community_count: s.communityCount,
        amplification_score: s.amplificationScore,
        reliability_score: s.reliabilityScore,
        support_ratio: s.supportRatio,
        contradiction_ratio: s.contradictionRatio,
        metadata: s.metadata ?? null,
      }));
      const { error } = await client.from('hsin_narrative_snapshots').insert(rows);
      if (!error) result.snapshots = rows.length;
      else logger.warn('temporal.persist.snapshots.failed', { error: String(error) });
    } catch (e) {
      logger.warn('temporal.persist.snapshots.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (2) Evolution — append-only insert.
  if (outputs.evolution.length > 0) {
    try {
      const rows = outputs.evolution.map((ev) => ({
        narrative_id: ev.narrativeId,
        change_type: ev.changeType,
        growth_pct: ev.growthPct,
        confidence: ev.confidence,
        metrics_json: {
          amplificationDelta: ev.amplificationDelta,
          communityDelta: ev.communityDelta,
          sourceDelta: ev.sourceDelta,
          reliabilityDelta: ev.reliabilityDelta,
          contradictionDelta: ev.contradictionDelta,
        },
        reasoning_json: ev.reasoning,
      }));
      const { error } = await client.from('hsin_narrative_evolution').insert(rows);
      if (!error) result.evolution = rows.length;
      else logger.warn('temporal.persist.evolution.failed', { error: String(error) });
    } catch (e) {
      logger.warn('temporal.persist.evolution.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (3) Genealogy — upsert on the (parent, child, relationship) unique key.
  if (outputs.genealogy.length > 0) {
    try {
      const rows = outputs.genealogy.map((g) => ({
        parent_narrative_id: g.parentNarrativeId,
        child_narrative_id: g.childNarrativeId,
        relationship: g.relationship,
        confidence: g.confidence,
        shared_entities: g.sharedEntities,
        shared_sources: g.sharedSources,
        similarity: g.similarity,
        rationale: g.rationale,
      }));
      const { error } = await client
        .from('hsin_narrative_genealogy')
        .upsert(rows, {
          onConflict: 'parent_narrative_id,child_narrative_id,relationship',
        });
      if (!error) result.genealogy = rows.length;
      else logger.warn('temporal.persist.genealogy.failed', { error: String(error) });
    } catch (e) {
      logger.warn('temporal.persist.genealogy.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (4) Influence — upsert on the (source, target) unique key.
  if (outputs.influence.length > 0) {
    try {
      const rows = outputs.influence.map((inf) => ({
        source_narrative_id: inf.sourceNarrativeId,
        target_narrative_id: inf.targetNarrativeId,
        influence_score: inf.influenceScore,
        shared_entities: inf.sharedEntities,
        shared_sources: inf.sharedSources,
        shared_communities: inf.sharedCommunities,
        rationale: inf.rationale,
      }));
      const { error } = await client
        .from('hsin_narrative_influence')
        .upsert(rows, { onConflict: 'source_narrative_id,target_narrative_id' });
      if (!error) result.influence = rows.length;
      else logger.warn('temporal.persist.influence.failed', { error: String(error) });
    } catch (e) {
      logger.warn('temporal.persist.influence.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (5) Forecasts — append-only insert (each run regenerates the distribution).
  if (outputs.forecasts.length > 0) {
    try {
      const rows = outputs.forecasts.map((f) => ({
        narrative_id: f.narrativeId,
        forecast_type: f.forecastType,
        probability: f.probability,
        reasoning: f.reasoning,
        distribution_json: f.distribution ?? null,
        generated_at: f.generatedAt,
      }));
      const { error } = await client.from('hsin_narrative_forecasts').insert(rows);
      if (!error) result.forecasts = rows.length;
      else logger.warn('temporal.persist.forecasts.failed', { error: String(error) });
    } catch (e) {
      logger.warn('temporal.persist.forecasts.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (6) Audit — append-only audit_logs event. NEVER records a publish.
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: null,
      action: 'temporal.pipeline',
      metadata: {
        snapshots: result.snapshots,
        evolution: result.evolution,
        genealogy: result.genealogy,
        influence: result.influence,
        forecasts: result.forecasts,
        at,
        autoPublished: false,
      },
    });
    result.audited = !error;
  } catch (e) {
    logger.warn('temporal.persist.audit.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return result;
};

/**
 * The registered temporal pipeline job. Uses the DB loader/persister by default;
 * both degrade to a clean fixtures-run / no-op offline (no service-role env), so
 * this is fully offline-safe and never throws fatally.
 */
export const temporalWorkerJob: Job = makeTemporalWorkerJob();
