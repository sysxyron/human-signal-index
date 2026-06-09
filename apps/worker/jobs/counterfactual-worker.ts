// =============================================================================
// apps/worker/jobs — counterfactualWorkerJob (WorldForge/HSI Phase 12)
//
// "What would have happened if X never happened?" The daily COUNTERFACTUAL +
// FORECAST-VALIDATION pipeline. Where Phase-10 (temporal) is "git history for
// ideas" and Phase-11 (causal) EXPLAINS that history, this worker probes the
// history's COUNTERFACTUALS and validates the forecasts that were made about it,
// by running the pure @hsi/counterfactual-engine over each narrative's actual
// signal history in six staged steps, each independently fault-isolated (a stage
// failure logs + continues — the worker NEVER throws fatally):
//
//   1. COUNTERFACTUALS — generateCounterfactual(input, scenario, now): replay the
//                        narrative with one grounded intervention applied and
//                        re-propagate downstream metrics → a CounterfactualResult
//                        (both timelines + deltas + confidence + LIMITATIONS).
//   2. INTERVENTIONS   — simulateIntervention(input, preset, now): the same, via
//                        the high-level INTERVENTION_PRESETS catalogue.
//   3. BACKTEST        — backtestForecasts(history, now): score each past forecast
//                        against what actually happened (Brier-style errorScore).
//   4. CALIBRATE       — computeForecastAccuracy + calibrateConfidence: rolling
//                        accuracy per (narrative, window) and a calibration model
//                        that pulls OVERCONFIDENT confidence bands DOWN.
//   5. WORLDFORGE      — generateCounterfactualWorld(input, result, now): render a
//                        counterfactual as an alternate world-state (title,
//                        summary, world_state, epochs, turning points).
//   6. PERSIST + AUDIT — write runs (+events), simulation results, accuracy, and
//                        WorldForge scenarios; append an audit_logs event.
//
// PURITY: the engine is pure & deterministic. The job derives a single `now`
// (ctx.runAt) and INJECTS it into every engine call and onto every input — it
// NEVER calls Date.now() inside the engine. No network, no keys.
//
// OFFLINE-SAFE (binding): the per-narrative CounterfactualInput bundle + backtest
// history are read via an INJECTED loader and the outputs are written via an
// INJECTED persister. The DEFAULT loader/persister operate on the service-role
// Supabase (the Phase-10/11 hsin_narrative_* / hsin_causal_events tables → read;
// the Phase-12 hsin_counterfactual_* / hsin_simulation_results /
// hsin_forecast_accuracy / hsin_worldforge_scenarios tables → write) WHEN the
// service-role env is configured; otherwise they degrade to the DEMO_CF_INPUTS /
// DEMO_BACKTEST_HISTORY fixtures (loader) and a no-op (persister), and the
// computed outputs are just logged. Empty env → a clean, deterministic fixtures
// run. NEVER throws.
//
// GOVERNANCE: this worker only SIMULATES/VALIDATES the counterfactual layer. It
// NEVER auto-publishes a narrative, never decides a review, never asserts truth —
// every counterfactual is an ESTIMATE (carrying explicit LIMITATIONS) for a HUMAN
// reviewer. An audit_logs event ('counterfactual.pipeline') is appended when the
// DB is configured.
//
// ICM: declared INPUTS (narrativeCount, snapshotCount, eventCount,
// backtestHistoryCount, mode) and OUTPUTS (runs/events/backtests/accuracy/
// scenarios counts) are logged.
//
// SCHEDULING: cron '0 5 * * *' (daily 05:00 UTC) — AFTER the Phase-11 causal
// worker (04:00) so the causal-events + forecast tables it reads are fresh.
// Driven by an external scheduler; the worker has no internal scheduler.
// =============================================================================

import {
  generateCounterfactual,
  simulateIntervention,
  backtestForecasts,
  computeForecastAccuracy,
  calibrateConfidence,
  generateCounterfactualWorld,
  INTERVENTION_PRESETS,
  DEMO_CF_INPUTS,
  DEMO_BACKTEST_HISTORY,
  type CounterfactualInput as CfInput,
  type CounterfactualResult as CfResult,
  type CounterfactualWorld as CfWorld,
  type BacktestRecord as CfBacktestRecord,
  type ForecastAccuracy as CfForecastAccuracy,
  type ScenarioType as CfScenarioType,
  type InterventionKey as CfInterventionKey,
  type CausalEvent as CfCausalEvent,
  type EvolutionRecord as CfEvolutionRecord,
  type NarrativeForecast as CfNarrativeForecast,
  type NarrativeSnapshot as CfNarrativeSnapshot,
} from '@hsi/counterfactual-engine';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** One backtest sample: a past forecast + the snapshot transition that followed. */
export interface CfBacktestSample {
  forecast: CfNarrativeForecast;
  priorSnapshot: CfNarrativeSnapshot;
  actualSnapshotAfter: CfNarrativeSnapshot;
}

/** The rolling forecast-accuracy window key used for upserts. */
export const COUNTERFACTUAL_FORECAST_WINDOW = '7d';

/** The default scenario applied per narrative when generating a counterfactual. */
export const DEFAULT_COUNTERFACTUAL_SCENARIO: CfScenarioType = 'remove_source';

/** The default high-level interventions probed per narrative (deterministic order). */
export const DEFAULT_COUNTERFACTUAL_INTERVENTIONS: CfInterventionKey[] = [
  'remove_amplification_spike',
  'delay_community_growth',
];

/** The per-narrative inputs + backtest history the engine operates on for one run. */
export interface CounterfactualWorld {
  inputs: CfInput[];
  /** Backtest history keyed by narrative id (consecutive snapshot transitions). */
  backtestByNarrative: Map<string, CfBacktestSample[]>;
}

/** A computed counterfactual run, paired with its rendered WorldForge scenario. */
export interface CounterfactualRunOutput {
  result: CfResult;
  world: CfWorld;
}

/** The full set of computed outputs handed to the persister. */
export interface CounterfactualOutputs {
  /** Counterfactual runs (the default scenario + each intervention) + their worlds. */
  runs: CounterfactualRunOutput[];
  /** All backtest records, across narratives. */
  backtests: CfBacktestRecord[];
  /** Rolling per-narrative forecast accuracy/calibration summaries. */
  accuracy: CfForecastAccuracy[];
}

/** Best-effort report of which output sets were persisted (for the summary). */
export interface CounterfactualPersistResult {
  runs: number;
  events: number;
  simulationResults: number;
  accuracy: number;
  scenarios: number;
  audited: boolean;
}

/** Loads the per-narrative inputs + backtest history (DB when configured, else fixtures). */
export type LoadCounterfactualWorld = (ctx: JobContext) => Promise<CounterfactualWorld>;

/** Persists the computed counterfactual outputs (DB when configured, else no-op). */
export type PersistCounterfactualOutputs = (
  outputs: CounterfactualOutputs,
  ctx: JobContext,
) => Promise<CounterfactualPersistResult>;

const EMPTY_PERSIST: CounterfactualPersistResult = {
  runs: 0,
  events: 0,
  simulationResults: 0,
  accuracy: 0,
  scenarios: 0,
  audited: false,
};

export function makeCounterfactualWorkerJob(
  load: LoadCounterfactualWorld = defaultLoadCounterfactualWorld,
  persist: PersistCounterfactualOutputs = defaultPersistCounterfactualOutputs,
): Job {
  return {
    name: 'counterfactual',
    description:
      'Daily counterfactual pipeline: counterfactuals → interventions → backtest → calibrate → WorldForge scenarios (never auto-publishes).',
    schedule: '0 5 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      // Deterministic clock is injected into the pure engine. We NEVER call
      // Date.now() inside the engine — `now` flows from the job context.
      const now = ctx.runAt;
      const offline = !counterfactualServiceRoleConfigured();

      // ---- Load the world (loader failure → empty, never fatal) --------------
      let world: CounterfactualWorld = {
        inputs: [],
        backtestByNarrative: new Map(),
      };
      try {
        world = await load(ctx);
      } catch (e) {
        logger.warn('job.counterfactual.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Pin the injected `now` onto every input so the engine stays deterministic.
      const inputs: CfInput[] = world.inputs.map((i) => ({ ...i, now }));

      const snapshotCount = inputs.reduce((acc, i) => acc + i.snapshots.length, 0);
      const eventCount = inputs.reduce((acc, i) => acc + i.events.length, 0);
      const backtestHistoryCount = Array.from(
        world.backtestByNarrative.values(),
      ).reduce((acc, h) => acc + h.length, 0);
      const declaredInputs = {
        narrativeCount: inputs.length,
        snapshotCount,
        eventCount,
        backtestHistoryCount,
        mode: offline ? 'offline-fixtures-or-noop' : 'db',
        runAt: now,
        // BINDING: the counterfactual worker only simulates/validates — never publishes.
        autoPublish: false,
      };
      logger.info('job.counterfactual.start', { declaredInputs });

      const outputs: CounterfactualOutputs = {
        runs: [],
        backtests: [],
        accuracy: [],
      };
      const stageErrors: Record<string, string> = {};

      // ---- Stages 1+2+5: COUNTERFACTUALS + INTERVENTIONS + WORLDFORGE --------
      // Each counterfactual run is immediately rendered as a WorldForge scenario.
      // Per-narrative + per-scenario try/catch keeps one bad narrative isolated.
      try {
        for (const input of inputs) {
          const buildRun = (result: CfResult): void => {
            try {
              const w = generateCounterfactualWorld(input, result, now);
              outputs.runs.push({ result, world: w });
            } catch (e) {
              // The counterfactual still stands even if the WorldForge render fails.
              logger.warn('job.counterfactual.worldforge.runFailed', {
                narrativeId: input.narrativeId,
                scenarioType: result.scenarioType,
                error: e instanceof Error ? e.message : String(e),
              });
              outputs.runs.push({ result, world: emptyWorld(result) });
            }
          };

          // Stage 1: the default grounded counterfactual scenario.
          try {
            buildRun(
              generateCounterfactual(
                input,
                { type: DEFAULT_COUNTERFACTUAL_SCENARIO },
                now,
              ),
            );
          } catch (e) {
            logger.warn('job.counterfactual.generate.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }

          // Stage 2: the high-level intervention presets.
          for (const key of DEFAULT_COUNTERFACTUAL_INTERVENTIONS) {
            try {
              buildRun(simulateIntervention(input, INTERVENTION_PRESETS[key], now));
            } catch (e) {
              logger.warn('job.counterfactual.intervention.narrativeFailed', {
                narrativeId: input.narrativeId,
                intervention: key,
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }
        logger.info('job.counterfactual.runs', { runs: outputs.runs.length });
      } catch (e) {
        stageErrors.runs = e instanceof Error ? e.message : String(e);
        logger.warn('job.counterfactual.runsFailed', { error: stageErrors.runs });
      }

      // ---- Stage 3: BACKTEST (per-narrative, fault-isolated) -----------------
      try {
        for (const [narrativeId, history] of world.backtestByNarrative) {
          if (history.length === 0) continue;
          try {
            outputs.backtests.push(...backtestForecasts(history, now));
          } catch (e) {
            logger.warn('job.counterfactual.backtest.narrativeFailed', {
              narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.counterfactual.backtest', {
          backtests: outputs.backtests.length,
        });
      } catch (e) {
        stageErrors.backtest = e instanceof Error ? e.message : String(e);
        logger.warn('job.counterfactual.backtestFailed', { error: stageErrors.backtest });
      }

      // ---- Stage 4: CALIBRATE (rolling per-narrative accuracy) ---------------
      // calibrateConfidence runs over ALL records (logged for visibility); the
      // per-narrative accuracy summaries are what get persisted (upserted).
      try {
        const recordsByNarrative = new Map<string, CfBacktestRecord[]>();
        for (const r of outputs.backtests) {
          const list = recordsByNarrative.get(r.narrativeId) ?? [];
          list.push(r);
          recordsByNarrative.set(r.narrativeId, list);
        }
        for (const [narrativeId, records] of recordsByNarrative) {
          try {
            outputs.accuracy.push(
              computeForecastAccuracy(
                records,
                narrativeId,
                COUNTERFACTUAL_FORECAST_WINDOW,
              ),
            );
          } catch (e) {
            logger.warn('job.counterfactual.calibrate.narrativeFailed', {
              narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        // Calibration model is informational here (pulls overconfident bands down).
        if (outputs.backtests.length > 0) {
          const calibration = calibrateConfidence(outputs.backtests);
          logger.info('job.counterfactual.calibrate', {
            accuracy: outputs.accuracy.length,
            overconfidenceIndex: calibration.overconfidenceIndex,
          });
        } else {
          logger.info('job.counterfactual.calibrate', { accuracy: outputs.accuracy.length });
        }
      } catch (e) {
        stageErrors.calibrate = e instanceof Error ? e.message : String(e);
        logger.warn('job.counterfactual.calibrateFailed', { error: stageErrors.calibrate });
      }

      // ---- Stage 6: PERSIST (best-effort; failure logs + continues) ----------
      let persisted: CounterfactualPersistResult = { ...EMPTY_PERSIST };
      try {
        persisted = await persist(outputs, ctx);
      } catch (e) {
        logger.warn('job.counterfactual.persistFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const summary = {
        computed: {
          runs: outputs.runs.length,
          backtests: outputs.backtests.length,
          accuracy: outputs.accuracy.length,
          scenarios: outputs.runs.length,
        },
        persisted,
        stageErrors,
        autoPublished: false,
      };
      logger.info('job.counterfactual.done', summary);

      return {
        job: 'counterfactual',
        ok: true,
        declaredInputs,
        summary,
      };
    },
  };
}

/** A minimal placeholder WorldForge world when the render fails (keeps the run). */
function emptyWorld(result: CfResult): CfWorld {
  return {
    scenarioTitle: result.scenarioName,
    scenarioSummary: result.summary,
    worldState: { narrativeId: result.narrativeId },
    confidence: result.confidence,
    epochs: [],
    turningPoints: [],
  };
}

// =============================================================================
// Service-role default loader/persister (offline-safe — null client → fixtures
// / no-op). The pure engine NEVER reads env; the worker resolves it here.
// =============================================================================

/** Minimal structural shape of the Supabase bits the counterfactual worker uses. */
interface CfSelectQuery {
  order: (col: string, opts?: { ascending?: boolean }) => CfSelectQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
}
interface CfClientLike {
  from(table: string): {
    select: (cols?: string) => CfSelectQuery;
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

/** True when the service-role env is present (mirrors the other workers). */
function counterfactualServiceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Resolve a service-role client, or null (offline). Never throws. */
function tryCounterfactualClient(): CfClientLike | null {
  if (!counterfactualServiceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as CfClientLike;
  } catch (e) {
    logger.warn('counterfactual.serviceRole.unavailable', {
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
interface CausalEventRow {
  id: string;
  narrative_id: string;
  event_type: string;
  event_strength: number | null;
  confidence: number | null;
  explanation: string | null;
  metrics_json: Record<string, number | string> | null;
  occurred_at: string;
  created_at: string | null;
}
interface ForecastRow {
  id: string;
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

function toSnapshot(r: SnapshotRow): CfNarrativeSnapshot {
  return {
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
  };
}

/**
 * Default loader: assemble one CounterfactualInput per narrative from the
 * Phase-10/11 tables (hsin_narrative_snapshots / hsin_narrative_evolution /
 * hsin_causal_events + the latest hsin_narrative_forecasts) and build a backtest
 * history from each narrative's consecutive snapshot transitions, when the
 * service-role client is configured; otherwise fall back to the deterministic
 * DEMO_CF_INPUTS / DEMO_BACKTEST_HISTORY fixtures. Never throws.
 */
export const defaultLoadCounterfactualWorld: LoadCounterfactualWorld = async () => {
  const client = tryCounterfactualClient();
  if (!client) {
    // OFFLINE: deterministic fixture inputs + backtest history. Network-free.
    const backtestByNarrative = new Map<string, CfBacktestSample[]>();
    for (const h of DEMO_BACKTEST_HISTORY) {
      const list = backtestByNarrative.get(h.forecast.narrativeId) ?? [];
      list.push(h);
      backtestByNarrative.set(h.forecast.narrativeId, list);
    }
    return { inputs: DEMO_CF_INPUTS, backtestByNarrative };
  }
  try {
    const [narrRes, snapRes, evoRes, evRes, fcRes] = await Promise.all([
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
        .from('hsin_causal_events')
        .select(
          'id,narrative_id,event_type,event_strength,confidence,explanation,metrics_json,occurred_at,created_at',
        )
        .order('occurred_at', { ascending: true })
        .limit(20000),
      client
        .from('hsin_narrative_forecasts')
        .select(
          'id,narrative_id,forecast_type,probability,reasoning,distribution_json,generated_at',
        )
        .order('generated_at', { ascending: true })
        .limit(20000),
    ]);

    const narrativeRows = (narrRes.error ? [] : (narrRes.data as NarrativeIdRow[])) ?? [];
    const snapshotRows = (snapRes.error ? [] : (snapRes.data as SnapshotRow[])) ?? [];
    const evolutionRows = (evoRes.error ? [] : (evoRes.data as EvolutionRow[])) ?? [];
    const eventRows = (evRes.error ? [] : (evRes.data as CausalEventRow[])) ?? [];
    const forecastRows = (fcRes.error ? [] : (fcRes.data as ForecastRow[])) ?? [];

    // Group snapshots by narrative (insertion order = time order, asc).
    const snapsByNarrative = new Map<string, CfNarrativeSnapshot[]>();
    for (const r of snapshotRows) {
      const list = snapsByNarrative.get(r.narrative_id) ?? [];
      list.push(toSnapshot(r));
      snapsByNarrative.set(r.narrative_id, list);
    }

    const evoByNarrative = new Map<string, CfEvolutionRecord[]>();
    for (const r of evolutionRows) {
      const m = (r.metrics_json ?? {}) as Record<string, unknown>;
      const list = evoByNarrative.get(r.narrative_id) ?? [];
      list.push({
        id: r.id,
        narrativeId: r.narrative_id,
        parentSnapshotId: '',
        childSnapshotId: '',
        changeType: r.change_type as CfEvolutionRecord['changeType'],
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

    // Causal events per narrative — these carry the REAL hsin_causal_events.id, so
    // a counterfactual change's originalEventId maps directly to that DB row.
    const eventsByNarrative = new Map<string, CfCausalEvent[]>();
    for (const r of eventRows) {
      const list = eventsByNarrative.get(r.narrative_id) ?? [];
      list.push({
        id: r.id,
        narrativeId: r.narrative_id,
        eventType: r.event_type as CfCausalEvent['eventType'],
        eventStrength: num(r.event_strength),
        confidence: num(r.confidence),
        explanation: r.explanation ?? '',
        occurredAt: r.occurred_at,
        metrics: r.metrics_json ?? {},
        createdAt: r.created_at ?? r.occurred_at,
      });
      eventsByNarrative.set(r.narrative_id, list);
    }

    // Keep only the latest forecast per narrative (rows are time-ordered asc).
    const forecastByNarrative = new Map<string, CfNarrativeForecast>();
    for (const r of forecastRows) {
      forecastByNarrative.set(r.narrative_id, {
        id: r.id,
        narrativeId: r.narrative_id,
        forecastType: r.forecast_type as CfNarrativeForecast['forecastType'],
        probability: num(r.probability),
        reasoning: asStringArray(r.reasoning),
        distribution: r.distribution_json ?? undefined,
        generatedAt: r.generated_at ?? '',
      });
    }

    // Build one input per narrative that has a snapshot history.
    const narrativeIds = new Set<string>();
    for (const r of narrativeRows) narrativeIds.add(r.id);
    for (const id of snapsByNarrative.keys()) narrativeIds.add(id);

    const inputs: CfInput[] = [];
    const backtestByNarrative = new Map<string, CfBacktestSample[]>();
    for (const narrativeId of narrativeIds) {
      const snapshots = snapsByNarrative.get(narrativeId) ?? [];
      if (snapshots.length === 0) continue; // nothing to simulate
      const forecast = forecastByNarrative.get(narrativeId);
      inputs.push({
        narrativeId,
        snapshots,
        evolution: evoByNarrative.get(narrativeId) ?? [],
        events: eventsByNarrative.get(narrativeId) ?? [],
        forecast,
        // `now` is re-pinned in run(); a placeholder keeps the bundle valid.
        now: '',
      });

      // Backtest history: the latest forecast scored against the most recent
      // observed snapshot transition (prior → after). Only when we have both a
      // forecast and ≥ 2 snapshots to derive the actual transition from.
      if (forecast && snapshots.length >= 2) {
        const after = snapshots[snapshots.length - 1];
        const prior = snapshots[snapshots.length - 2];
        backtestByNarrative.set(narrativeId, [
          { forecast, priorSnapshot: prior, actualSnapshotAfter: after },
        ]);
      }
    }

    return { inputs, backtestByNarrative };
  } catch (e) {
    logger.warn('counterfactual.dbLoad.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { inputs: [], backtestByNarrative: new Map() };
  }
};

/**
 * Default persister: write the computed outputs to the Phase-12 hsin_* tables
 * when the service-role client is configured; otherwise a clean no-op (offline).
 * Each table write is best-effort and fault-isolated. A counterfactual run is
 * inserted first (returning its id) so its applied event ACTIONS
 * (hsin_counterfactual_events) and rendered WorldForge SCENARIO
 * (hsin_worldforge_scenarios) link back to the freshly inserted run row. Backtest
 * records become hsin_simulation_results; per-narrative accuracy is UPSERTED into
 * hsin_forecast_accuracy on (narrative_id, forecast_window). NEVER auto-publishes —
 * and appends an audit_logs event. Never throws.
 */
export const defaultPersistCounterfactualOutputs: PersistCounterfactualOutputs = async (
  outputs,
  ctx,
) => {
  const client = tryCounterfactualClient();
  if (!client) return { ...EMPTY_PERSIST };

  const at = ctx.runAt;
  const result: CounterfactualPersistResult = { ...EMPTY_PERSIST };

  // Only well-formed uuids are valid original_event_id FKs into hsin_causal_events.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // (1) Runs — insert each run, then its applied event actions + WorldForge scenario.
  for (const { result: cf, world } of outputs.runs) {
    try {
      const { data, error } = await client
        .from('hsin_counterfactual_runs')
        .insert({
          narrative_id: cf.narrativeId,
          scenario_name: cf.scenarioName,
          scenario_type: cf.scenarioType,
          confidence: cf.confidence,
          summary: cf.summary,
          inputs_json: {
            confidenceBand: cf.confidenceBand,
            reasoning: cf.reasoning,
            limitations: cf.limitations,
            evidence: cf.evidence,
          },
          results_json: {
            deltas: cf.deltas,
            original: cf.original,
            counterfactual: cf.counterfactual,
            changes: cf.changes,
          },
          generated_at: cf.generatedAt,
        })
        .select('id');
      if (error) {
        logger.warn('counterfactual.persist.runs.failed', {
          narrativeId: cf.narrativeId,
          error: String(error),
        });
        continue;
      }
      result.runs += 1;
      const runRow = ((data as { id: string }[] | null) ?? [])[0];
      const runId = runRow?.id;
      if (!runId) continue;

      // (1a) Event actions for this run (append-only).
      if (cf.changes.length > 0) {
        try {
          const eventRows = cf.changes.map((c) => ({
            counterfactual_run_id: runId,
            original_event_id:
              c.originalEventId && UUID_RE.test(c.originalEventId)
                ? c.originalEventId
                : null,
            action: c.action,
            impact_score: c.impactScore,
            reasoning: c.reasoning,
          }));
          const { error: evErr } = await client
            .from('hsin_counterfactual_events')
            .insert(eventRows);
          if (!evErr) result.events += eventRows.length;
          else
            logger.warn('counterfactual.persist.events.failed', {
              runId,
              error: String(evErr),
            });
        } catch (e) {
          logger.warn('counterfactual.persist.events.threw', {
            runId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // (1b) WorldForge scenario for this run (append-only).
      try {
        const { error: scErr } = await client
          .from('hsin_worldforge_scenarios')
          .insert({
            counterfactual_run_id: runId,
            scenario_title: world.scenarioTitle,
            scenario_summary: world.scenarioSummary,
            world_state: {
              ...world.worldState,
              epochs: world.epochs,
              turningPoints: world.turningPoints,
            },
            confidence: world.confidence,
          });
        if (!scErr) result.scenarios += 1;
        else
          logger.warn('counterfactual.persist.scenarios.failed', {
            runId,
            error: String(scErr),
          });
      } catch (e) {
        logger.warn('counterfactual.persist.scenarios.threw', {
          runId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } catch (e) {
      logger.warn('counterfactual.persist.runs.threw', {
        narrativeId: cf.narrativeId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (2) Simulation results — append-only insert of the backtest records.
  // (No counterfactual_run_id is associated — these validate FORECASTS, not a
  // specific run; the column is NOT NULL in the schema, so we attach the first
  // persisted run for the same narrative when available, else skip the row.)
  if (outputs.backtests.length > 0) {
    // Map narrative → a run id we just inserted, so the NOT-NULL FK is satisfied.
    const runIdByNarrative = new Map<string, string>();
    // We re-query inserted runs cheaply via the in-memory outputs: the first run
    // per narrative is representative. (Run ids were not captured above per
    // narrative, so we look them up from the DB by narrative + generated_at.)
    try {
      for (const { result: cf } of outputs.runs) {
        if (!runIdByNarrative.has(cf.narrativeId)) {
          runIdByNarrative.set(cf.narrativeId, '');
        }
      }
      // Fetch the most recent run id per narrative for this batch.
      const { data, error } = await client
        .from('hsin_counterfactual_runs')
        .select('id,narrative_id,generated_at')
        .order('generated_at', { ascending: false })
        .limit(20000);
      if (!error) {
        const rows =
          (data as { id: string; narrative_id: string }[] | null) ?? [];
        for (const r of rows) {
          if (
            runIdByNarrative.has(r.narrative_id) &&
            runIdByNarrative.get(r.narrative_id) === ''
          ) {
            runIdByNarrative.set(r.narrative_id, r.id);
          }
        }
      }

      const simRows = outputs.backtests
        .map((b) => {
          const runId = runIdByNarrative.get(b.narrativeId);
          if (!runId) return null;
          return {
            counterfactual_run_id: runId,
            forecast_id:
              b.forecastId && UUID_RE.test(b.forecastId) ? b.forecastId : null,
            predicted_state: b.predictedState,
            predicted_probability: b.predictedProbability,
            actual_state: b.actualState,
            actual_probability: b.actualProbability,
            error_score: b.errorScore,
          };
        })
        .filter(
          (
            r,
          ): r is {
            counterfactual_run_id: string;
            forecast_id: string | null;
            predicted_state: string;
            predicted_probability: number;
            actual_state: string;
            actual_probability: number;
            error_score: number;
          } => r !== null,
        );
      if (simRows.length > 0) {
        const { error: simErr } = await client
          .from('hsin_simulation_results')
          .insert(simRows);
        if (!simErr) result.simulationResults = simRows.length;
        else
          logger.warn('counterfactual.persist.simulationResults.failed', {
            error: String(simErr),
          });
      }
    } catch (e) {
      logger.warn('counterfactual.persist.simulationResults.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (3) Forecast accuracy — upsert on (narrative_id, forecast_window) (idempotent).
  if (outputs.accuracy.length > 0) {
    try {
      const rows = outputs.accuracy.map((a) => ({
        narrative_id: a.narrativeId,
        forecast_window: a.forecastWindow,
        prediction_count: a.predictionCount,
        accuracy_score: a.accuracyScore,
        calibration_score: a.calibrationScore,
      }));
      const { error } = await client
        .from('hsin_forecast_accuracy')
        .upsert(rows, { onConflict: 'narrative_id,forecast_window' });
      if (!error) result.accuracy = rows.length;
      else
        logger.warn('counterfactual.persist.accuracy.failed', {
          error: String(error),
        });
    } catch (e) {
      logger.warn('counterfactual.persist.accuracy.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (4) Audit — append-only audit_logs event. NEVER records a publish.
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: null,
      action: 'counterfactual.pipeline',
      metadata: {
        runs: result.runs,
        events: result.events,
        simulationResults: result.simulationResults,
        accuracy: result.accuracy,
        scenarios: result.scenarios,
        at,
        autoPublished: false,
      },
    });
    result.audited = !error;
  } catch (e) {
    logger.warn('counterfactual.persist.audit.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return result;
};

/**
 * The registered counterfactual pipeline job. Uses the DB loader/persister by
 * default; both degrade to a clean fixtures-run / no-op offline (no service-role
 * env), so this is fully offline-safe and never throws fatally.
 */
export const counterfactualWorkerJob: Job = makeCounterfactualWorkerJob();
