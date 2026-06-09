// =============================================================================
// apps/worker/jobs — decisionWorkerJob (WorldForge/HSI Phase 13)
//
// "What should we do next?" + "Which intervention has the highest probability of
// success?" The daily DECISION-INTELLIGENCE + WAR-GAMING pipeline. Where Phase-10
// (temporal) is "git history for ideas", Phase-11 (causal) EXPLAINS that history
// and Phase-12 (counterfactual) probes its COUNTERFACTUALS, this worker turns all
// of that into STRATEGIC DECISION AIDS by running the pure
// @hsi/decision-intelligence engine over each narrative's actual signal / causal /
// counterfactual history in staged steps, each independently fault-isolated (a
// stage failure logs + continues — the worker NEVER throws fatally):
//
//   1. SENSITIVITY — runSensitivityAnalysis(input, now): which causal events drive
//                    the observed change (dominant cause + unexplained residual).
//   2. RECOMMEND   — generateRecommendations(input, now): the calibrated strategic
//                    recommendation (intervention/monitor/escalate/no_action/
//                    counter_narrative) with reasoning + LIMITATIONS + evidence.
//   3. RANK        — rankInterventions(input, now): the 12 candidate interventions
//                    ranked by (|effect| × confidence ÷ risk).
//   4. DECISION    — generateDecisionRun(input, now): assemble (1)+(2)+(3) into one
//                    DecisionRun + buildDecisionAudit(run, now): an explainable,
//                    step-by-step audit trail (no black-box).
//   5. WAR-GAME    — compareScenarios(input, A, B, now): a head-to-head scenario
//                    A-vs-B comparison (which plan moves the trajectory more
//                    reliably; 'tie' within a small margin).
//   6. CROSS       — computeCrossNarrativeImpact(source, targets, now): how a
//                    narrative amplifies/dampens/triggers/competes-with/reinforces
//                    each other narrative.
//   7. PERSIST + AUDIT — write decision runs (+ intervention rankings + decision
//                    audits), scenario comparisons, and cross-narrative impacts;
//                    append an audit_logs event.
//
// PURITY: the engine is pure & deterministic. The job derives a single `now`
// (ctx.runAt) and INJECTS it into every engine call and onto every input — it
// NEVER calls Date.now() inside the engine. No network, no keys.
//
// OFFLINE-SAFE (binding): the per-narrative DecisionInput bundle + cross-narrative
// targets are read via an INJECTED loader and the outputs are written via an
// INJECTED persister. The DEFAULT loader/persister operate on the service-role
// Supabase (the Phase-10/11 hsin_narrative_* / hsin_causal_events tables + latest
// hsin_narrative_forecasts + hsin_narrative_influence → read; the Phase-13
// hsin_decision_runs / hsin_intervention_rankings / hsin_decision_audits /
// hsin_scenario_comparisons / hsin_cross_narrative_impacts tables → write) WHEN the
// service-role env is configured; otherwise they degrade to the
// DEMO_DECISION_INPUTS / DEMO_CROSS_TARGETS fixtures (loader) and a no-op
// (persister), and the computed outputs are just logged. Empty env → a clean,
// deterministic fixtures run. NEVER throws.
//
// GOVERNANCE: this worker only RECOMMENDS / WAR-GAMES the decision layer. It NEVER
// auto-publishes a narrative, never decides a review, never asserts truth — every
// recommendation is a decision AID (carrying explicit LIMITATIONS) for a HUMAN
// reviewer. An audit_logs event ('decision.pipeline') is appended when the DB is
// configured.
//
// ICM: declared INPUTS (narrativeCount, snapshotCount, eventCount, crossTargetCount,
// mode) and OUTPUTS (decisionRuns/rankings/comparisons/crossImpacts/audits counts)
// are logged.
//
// SCHEDULING: cron '0 6 * * *' (daily 06:00 UTC) — AFTER the Phase-12
// counterfactual worker (05:00) so the causal-events + forecast tables it reads are
// fresh. Driven by an external scheduler; the worker has no internal scheduler.
// =============================================================================

import {
  generateDecisionRun,
  runSensitivityAnalysis,
  generateRecommendations,
  rankInterventions,
  compareScenarios,
  computeCrossNarrativeImpact,
  buildDecisionAudit,
  DEMO_DECISION_INPUTS,
  DEMO_CROSS_TARGETS,
  type DecisionInput as DecInput,
  type DecisionRun as DecRun,
  type DecisionAudit as DecAudit,
  type InterventionRanking as DecInterventionRanking,
  type InterventionType as DecInterventionType,
  type ScenarioBattleResult as DecScenarioBattle,
  type CrossNarrativeImpact as DecCrossImpact,
  type CrossNarrativeTarget as DecCrossTarget,
  type CausalEvent as DecCausalEvent,
  type EvolutionRecord as DecEvolutionRecord,
  type InfluenceEdge as DecInfluenceEdge,
  type NarrativeForecast as DecNarrativeForecast,
  type NarrativeSnapshot as DecNarrativeSnapshot,
} from '@hsi/decision-intelligence';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

/** The two named scenarios war-gamed per narrative (deterministic, baseline-relative). */
export const DEFAULT_DECISION_SCENARIO_A: {
  name: string;
  interventions: DecInterventionType[];
} = { name: 'Damp amplification', interventions: ['reduce_amplification'] };
export const DEFAULT_DECISION_SCENARIO_B: {
  name: string;
  interventions: DecInterventionType[];
} = { name: 'Do nothing', interventions: [] };

/** The per-narrative inputs + cross-narrative targets the engine operates on. */
export interface DecisionWorld {
  inputs: DecInput[];
  /** Cross-narrative targets keyed by SOURCE narrative id. */
  crossTargetsByNarrative: Map<string, DecCrossTarget[]>;
}

/** One computed decision run: the run, its audit, and its scenario war-game. */
export interface DecisionRunOutput {
  run: DecRun;
  audit: DecAudit;
  battle: DecScenarioBattle;
}

/** The full set of computed outputs handed to the persister. */
export interface DecisionOutputs {
  /** Decision runs (one per narrative) + their audit + scenario comparison. */
  runs: DecisionRunOutput[];
  /** Cross-narrative impacts, across all source narratives. */
  crossImpacts: DecCrossImpact[];
}

/** Best-effort report of which output sets were persisted (for the summary). */
export interface DecisionPersistResult {
  decisionRuns: number;
  rankings: number;
  comparisons: number;
  crossImpacts: number;
  audits: number;
  audited: boolean;
}

/** Loads the per-narrative inputs + cross targets (DB when configured, else fixtures). */
export type LoadDecisionWorld = (ctx: JobContext) => Promise<DecisionWorld>;

/** Persists the computed decision outputs (DB when configured, else no-op). */
export type PersistDecisionOutputs = (
  outputs: DecisionOutputs,
  ctx: JobContext,
) => Promise<DecisionPersistResult>;

const EMPTY_PERSIST: DecisionPersistResult = {
  decisionRuns: 0,
  rankings: 0,
  comparisons: 0,
  crossImpacts: 0,
  audits: 0,
  audited: false,
};

export function makeDecisionWorkerJob(
  load: LoadDecisionWorld = defaultLoadDecisionWorld,
  persist: PersistDecisionOutputs = defaultPersistDecisionOutputs,
): Job {
  return {
    name: 'decision',
    description:
      'Daily decision pipeline: sensitivity → recommend → rank → decision run + audit → war-game → cross impacts (never auto-publishes).',
    schedule: '0 6 * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      // Deterministic clock is injected into the pure engine. We NEVER call
      // Date.now() inside the engine — `now` flows from the job context.
      const now = ctx.runAt;
      const offline = !decisionServiceRoleConfigured();

      // ---- Load the world (loader failure → empty, never fatal) --------------
      let world: DecisionWorld = {
        inputs: [],
        crossTargetsByNarrative: new Map(),
      };
      try {
        world = await load(ctx);
      } catch (e) {
        logger.warn('job.decision.loadFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // Pin the injected `now` onto every input so the engine stays deterministic.
      const inputs: DecInput[] = world.inputs.map((i) => ({ ...i, now }));

      const snapshotCount = inputs.reduce((acc, i) => acc + i.snapshots.length, 0);
      const eventCount = inputs.reduce((acc, i) => acc + i.events.length, 0);
      const crossTargetCount = Array.from(
        world.crossTargetsByNarrative.values(),
      ).reduce((acc, t) => acc + t.length, 0);
      const declaredInputs = {
        narrativeCount: inputs.length,
        snapshotCount,
        eventCount,
        crossTargetCount,
        mode: offline ? 'offline-fixtures-or-noop' : 'db',
        runAt: now,
        // BINDING: the decision worker only recommends/war-games — never publishes.
        autoPublish: false,
      };
      logger.info('job.decision.start', { declaredInputs });

      const outputs: DecisionOutputs = {
        runs: [],
        crossImpacts: [],
      };
      const stageErrors: Record<string, string> = {};

      // ---- Stages 1-5: per-narrative decision run + audit + war-game ---------
      // Each stage is logged for visibility; the assembled DecisionRun reuses the
      // sensitivity/ranking/recommendation internally, but we also run them
      // standalone so a single failing sub-stage is isolated + logged per narrative.
      try {
        for (const input of inputs) {
          try {
            // Stage 1 (SENSITIVITY) + Stage 3 (RANK) — standalone for visibility.
            // Failures here are non-fatal: generateDecisionRun recomputes them.
            try {
              const sensitivity = runSensitivityAnalysis(input, now);
              logger.debug('job.decision.sensitivity', {
                narrativeId: input.narrativeId,
                dominant: sensitivity.dominant?.eventType ?? null,
                unexplainedPct: sensitivity.unexplainedPct,
              });
            } catch (e) {
              logger.warn('job.decision.sensitivity.narrativeFailed', {
                narrativeId: input.narrativeId,
                error: e instanceof Error ? e.message : String(e),
              });
            }
            try {
              const rankings: DecInterventionRanking[] = rankInterventions(input, now);
              logger.debug('job.decision.rank', {
                narrativeId: input.narrativeId,
                rankings: rankings.length,
              });
            } catch (e) {
              logger.warn('job.decision.rank.narrativeFailed', {
                narrativeId: input.narrativeId,
                error: e instanceof Error ? e.message : String(e),
              });
            }
            try {
              const recommendation = generateRecommendations(input, now);
              logger.debug('job.decision.recommend', {
                narrativeId: input.narrativeId,
                decisionType: recommendation.decisionType,
              });
            } catch (e) {
              logger.warn('job.decision.recommend.narrativeFailed', {
                narrativeId: input.narrativeId,
                error: e instanceof Error ? e.message : String(e),
              });
            }

            // Stage 4: DECISION RUN (assembled) + AUDIT — the canonical output.
            const run = generateDecisionRun(input, now);
            let audit: DecAudit;
            try {
              audit = buildDecisionAudit(run, now);
            } catch (e) {
              logger.warn('job.decision.audit.narrativeFailed', {
                narrativeId: input.narrativeId,
                error: e instanceof Error ? e.message : String(e),
              });
              audit = emptyAudit(run);
            }

            // Stage 5: WAR-GAME — a head-to-head scenario comparison for the run.
            let battle: DecScenarioBattle;
            try {
              battle = compareScenarios(
                input,
                DEFAULT_DECISION_SCENARIO_A,
                DEFAULT_DECISION_SCENARIO_B,
                now,
              );
            } catch (e) {
              logger.warn('job.decision.warGame.narrativeFailed', {
                narrativeId: input.narrativeId,
                error: e instanceof Error ? e.message : String(e),
              });
              battle = emptyBattle();
            }

            outputs.runs.push({ run, audit, battle });
          } catch (e) {
            // A bad narrative is isolated — the rest of the pipeline continues.
            logger.warn('job.decision.run.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.decision.runs', { runs: outputs.runs.length });
      } catch (e) {
        stageErrors.runs = e instanceof Error ? e.message : String(e);
        logger.warn('job.decision.runsFailed', { error: stageErrors.runs });
      }

      // ---- Stage 6: CROSS-NARRATIVE IMPACTS (per source, fault-isolated) -----
      try {
        for (const input of inputs) {
          const targets = world.crossTargetsByNarrative.get(input.narrativeId);
          if (!targets || targets.length === 0) continue;
          try {
            outputs.crossImpacts.push(
              ...computeCrossNarrativeImpact(input, targets, now),
            );
          } catch (e) {
            logger.warn('job.decision.cross.narrativeFailed', {
              narrativeId: input.narrativeId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        logger.info('job.decision.cross', {
          crossImpacts: outputs.crossImpacts.length,
        });
      } catch (e) {
        stageErrors.cross = e instanceof Error ? e.message : String(e);
        logger.warn('job.decision.crossFailed', { error: stageErrors.cross });
      }

      // ---- Stage 7: PERSIST (best-effort; failure logs + continues) ----------
      let persisted: DecisionPersistResult = { ...EMPTY_PERSIST };
      try {
        persisted = await persist(outputs, ctx);
      } catch (e) {
        logger.warn('job.decision.persistFailed', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const summary = {
        computed: {
          decisionRuns: outputs.runs.length,
          rankings: outputs.runs.reduce((acc, r) => acc + r.run.rankings.length, 0),
          comparisons: outputs.runs.length,
          crossImpacts: outputs.crossImpacts.length,
          audits: outputs.runs.length,
        },
        persisted,
        stageErrors,
        autoPublished: false,
      };
      logger.info('job.decision.done', summary);

      return {
        job: 'decision',
        ok: true,
        declaredInputs,
        summary,
      };
    },
  };
}

/** A minimal placeholder audit when the audit render fails (keeps the run). */
function emptyAudit(run: DecRun): DecAudit {
  return {
    decisionRunId: `${run.narrativeId}@${run.generatedAt}`,
    decisionOutput: {
      narrativeId: run.narrativeId,
      decisionType: run.decisionType,
      recommendedAction: run.recommendedAction,
    },
    confidence: run.confidence,
    limitations: run.limitations,
    auditLog: [],
  };
}

/** A minimal placeholder war-game when the comparison fails (keeps the run). */
function emptyBattle(): DecScenarioBattle {
  return {
    scenarioA: DEFAULT_DECISION_SCENARIO_A,
    scenarioB: DEFAULT_DECISION_SCENARIO_B,
    winner: 'tie',
    confidence: 0,
    reasoning: ['War-game unavailable for this narrative.'],
    limitations: ['Comparison could not be computed — treat as no signal.'],
    metrics: { a: {}, b: {} },
  };
}

// =============================================================================
// Service-role default loader/persister (offline-safe — null client → fixtures
// / no-op). The pure engine NEVER reads env; the worker resolves it here.
// =============================================================================

/** Minimal structural shape of the Supabase bits the decision worker uses. */
interface DecSelectQuery {
  order: (col: string, opts?: { ascending?: boolean }) => DecSelectQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
}
interface DecClientLike {
  from(table: string): {
    select: (cols?: string) => DecSelectQuery;
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
function decisionServiceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Resolve a service-role client, or null (offline). Never throws. */
function tryDecisionClient(): DecClientLike | null {
  if (!decisionServiceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as DecClientLike;
  } catch (e) {
    logger.warn('decision.serviceRole.unavailable', {
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

function toSnapshot(r: SnapshotRow): DecNarrativeSnapshot {
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
 * Default loader: assemble one DecisionInput per narrative from the Phase-10/11
 * tables (hsin_narrative_snapshots / hsin_narrative_evolution / hsin_causal_events
 * + the latest hsin_narrative_forecasts + hsin_narrative_influence) and derive the
 * cross-narrative targets from each narrative's outbound influence edges (against
 * the other narratives' snapshots), when the service-role client is configured;
 * otherwise fall back to the deterministic DEMO_DECISION_INPUTS / DEMO_CROSS_TARGETS
 * fixtures. Never throws.
 */
export const defaultLoadDecisionWorld: LoadDecisionWorld = async () => {
  const client = tryDecisionClient();
  if (!client) {
    // OFFLINE: deterministic fixture inputs + cross targets. Network-free.
    const crossTargetsByNarrative = new Map<string, DecCrossTarget[]>();
    if (DEMO_DECISION_INPUTS.length > 0) {
      // DEMO_CROSS_TARGETS are the targets for the FIRST fixture narrative (source).
      crossTargetsByNarrative.set(
        DEMO_DECISION_INPUTS[0].narrativeId,
        DEMO_CROSS_TARGETS,
      );
    }
    return { inputs: DEMO_DECISION_INPUTS, crossTargetsByNarrative };
  }
  try {
    const [narrRes, snapRes, evoRes, evRes, infRes, fcRes] = await Promise.all([
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
        .from('hsin_narrative_influence')
        .select(
          'source_narrative_id,target_narrative_id,influence_score,shared_entities,shared_sources,shared_communities,rationale,created_at',
        )
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
    const influenceRows = (infRes.error ? [] : (infRes.data as InfluenceRow[])) ?? [];
    const forecastRows = (fcRes.error ? [] : (fcRes.data as ForecastRow[])) ?? [];

    // Group snapshots by narrative (insertion order = time order, asc).
    const snapsByNarrative = new Map<string, DecNarrativeSnapshot[]>();
    for (const r of snapshotRows) {
      const list = snapsByNarrative.get(r.narrative_id) ?? [];
      list.push(toSnapshot(r));
      snapsByNarrative.set(r.narrative_id, list);
    }

    const evoByNarrative = new Map<string, DecEvolutionRecord[]>();
    for (const r of evolutionRows) {
      const m = (r.metrics_json ?? {}) as Record<string, unknown>;
      const list = evoByNarrative.get(r.narrative_id) ?? [];
      list.push({
        id: r.id,
        narrativeId: r.narrative_id,
        parentSnapshotId: '',
        childSnapshotId: '',
        changeType: r.change_type as DecEvolutionRecord['changeType'],
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

    // Causal events per narrative — these carry the REAL hsin_causal_events.id.
    const eventsByNarrative = new Map<string, DecCausalEvent[]>();
    for (const r of eventRows) {
      const list = eventsByNarrative.get(r.narrative_id) ?? [];
      list.push({
        id: r.id,
        narrativeId: r.narrative_id,
        eventType: r.event_type as DecCausalEvent['eventType'],
        eventStrength: num(r.event_strength),
        confidence: num(r.confidence),
        explanation: r.explanation ?? '',
        occurredAt: r.occurred_at,
        metrics: r.metrics_json ?? {},
        createdAt: r.created_at ?? r.occurred_at,
      });
      eventsByNarrative.set(r.narrative_id, list);
    }

    // Influence edges, grouped inbound + outbound per narrative.
    const inboundByNarrative = new Map<string, DecInfluenceEdge[]>();
    const outboundByNarrative = new Map<string, DecInfluenceEdge[]>();
    for (const r of influenceRows) {
      const edge: DecInfluenceEdge = {
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
    const forecastByNarrative = new Map<string, DecNarrativeForecast>();
    for (const r of forecastRows) {
      forecastByNarrative.set(r.narrative_id, {
        id: r.id,
        narrativeId: r.narrative_id,
        forecastType: r.forecast_type as DecNarrativeForecast['forecastType'],
        probability: num(r.probability),
        reasoning: asStringArray(r.reasoning),
        distribution: r.distribution_json as DecNarrativeForecast['distribution'],
        generatedAt: r.generated_at ?? '',
      });
    }

    // Build one input per narrative that has a snapshot history.
    const narrativeIds = new Set<string>();
    for (const r of narrativeRows) narrativeIds.add(r.id);
    for (const id of snapsByNarrative.keys()) narrativeIds.add(id);

    const inputs: DecInput[] = [];
    for (const narrativeId of narrativeIds) {
      const snapshots = snapsByNarrative.get(narrativeId) ?? [];
      if (snapshots.length === 0) continue; // nothing to decide on
      inputs.push({
        narrativeId,
        snapshots,
        evolution: evoByNarrative.get(narrativeId) ?? [],
        events: eventsByNarrative.get(narrativeId) ?? [],
        forecast: forecastByNarrative.get(narrativeId),
        influenceOut: outboundByNarrative.get(narrativeId),
        influenceIn: inboundByNarrative.get(narrativeId),
        // `now` is re-pinned in run(); a placeholder keeps the bundle valid.
        now: '',
      });
    }

    // Cross-narrative targets: for each source narrative, build a target per
    // outbound influence edge that points at another narrative we have snapshots
    // for. The strength heuristic reads the edge weight + shared communities/sources
    // + the target's snapshot trajectory.
    const crossTargetsByNarrative = new Map<string, DecCrossTarget[]>();
    for (const [sourceId, edges] of outboundByNarrative) {
      const targets: DecCrossTarget[] = [];
      for (const e of edges) {
        const tgtSnaps = snapsByNarrative.get(e.targetNarrativeId);
        if (!tgtSnaps || tgtSnaps.length === 0) continue;
        targets.push({
          narrativeId: e.targetNarrativeId,
          snapshots: tgtSnaps.map((s) => ({
            capturedAt: s.capturedAt,
            signalCount: s.signalCount,
            amplificationScore: s.amplificationScore,
          })),
          influenceFromSource: e.influenceScore,
          sharedCommunities: e.sharedCommunities,
          sharedSources: e.sharedSources,
        });
      }
      if (targets.length > 0) crossTargetsByNarrative.set(sourceId, targets);
    }

    return { inputs, crossTargetsByNarrative };
  } catch (e) {
    logger.warn('decision.dbLoad.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { inputs: [], crossTargetsByNarrative: new Map() };
  }
};

/**
 * Default persister: write the computed outputs to the Phase-13 hsin_* tables when
 * the service-role client is configured; otherwise a clean no-op (offline). Each
 * table write is best-effort and fault-isolated. A decision run is inserted first
 * (returning its id) so its ranked INTERVENTIONS (hsin_intervention_rankings), its
 * AUDIT (hsin_decision_audits) and its scenario WAR-GAME (hsin_scenario_comparisons)
 * link back to the freshly inserted run row. Cross-narrative impacts are UPSERTED
 * into hsin_cross_narrative_impacts on (source, target, impact_type). NEVER
 * auto-publishes — and appends an audit_logs event. Never throws.
 */
export const defaultPersistDecisionOutputs: PersistDecisionOutputs = async (
  outputs,
  ctx,
) => {
  const client = tryDecisionClient();
  if (!client) return { ...EMPTY_PERSIST };

  const at = ctx.runAt;
  const result: DecisionPersistResult = { ...EMPTY_PERSIST };

  // Only well-formed uuids are valid narrative FKs into hsin_narratives.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // (1) Decision runs — insert each run, then its rankings + audit + war-game.
  for (const { run, audit, battle } of outputs.runs) {
    try {
      const { data, error } = await client
        .from('hsin_decision_runs')
        .insert({
          narrative_id: run.narrativeId,
          decision_name: run.decisionName,
          decision_type: run.decisionType,
          confidence: run.confidence,
          recommended_action: run.recommendedAction,
          reasoning: run.reasoning,
          limitations: run.limitations,
          generated_at: run.generatedAt,
        })
        .select('id');
      if (error) {
        logger.warn('decision.persist.runs.failed', {
          narrativeId: run.narrativeId,
          error: String(error),
        });
        continue;
      }
      result.decisionRuns += 1;
      const runRow = ((data as { id: string }[] | null) ?? [])[0];
      const runId = runRow?.id;
      if (!runId) continue;

      // (1a) Intervention rankings for this run (append-only).
      if (run.rankings.length > 0) {
        try {
          const rankRows = run.rankings.map((r) => ({
            decision_run_id: runId,
            intervention_type: r.interventionType,
            expected_effect: r.expectedEffect,
            risk_score: r.riskScore,
            confidence: r.confidence,
            rank_position: r.rankPosition,
            reasoning: r.reasoning,
          }));
          const { error: rkErr } = await client
            .from('hsin_intervention_rankings')
            .insert(rankRows);
          if (!rkErr) result.rankings += rankRows.length;
          else
            logger.warn('decision.persist.rankings.failed', {
              runId,
              error: String(rkErr),
            });
        } catch (e) {
          logger.warn('decision.persist.rankings.threw', {
            runId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // (1b) Decision audit for this run (append-only).
      try {
        const { error: auErr } = await client
          .from('hsin_decision_audits')
          .insert({
            decision_run_id: runId,
            decision_output: audit.decisionOutput,
            confidence: audit.confidence,
            limitations: audit.limitations,
            audit_log: audit.auditLog,
          });
        if (!auErr) result.audits += 1;
        else
          logger.warn('decision.persist.audits.failed', {
            runId,
            error: String(auErr),
          });
      } catch (e) {
        logger.warn('decision.persist.audits.threw', {
          runId,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // (1c) Scenario comparison (war-game) for this run (append-only).
      try {
        const { error: scErr } = await client
          .from('hsin_scenario_comparisons')
          .insert({
            decision_run_id: runId,
            scenario_a: {
              ...battle.scenarioA,
              metrics: battle.metrics.a,
            },
            scenario_b: {
              ...battle.scenarioB,
              metrics: battle.metrics.b,
            },
            winner: battle.winner,
            confidence: battle.confidence,
            comparison_reasoning: battle.reasoning.join(' | '),
          });
        if (!scErr) result.comparisons += 1;
        else
          logger.warn('decision.persist.comparisons.failed', {
            runId,
            error: String(scErr),
          });
      } catch (e) {
        logger.warn('decision.persist.comparisons.threw', {
          runId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } catch (e) {
      logger.warn('decision.persist.runs.threw', {
        narrativeId: run.narrativeId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (2) Cross-narrative impacts — upsert on (source, target, impact_type)
  // (idempotent). Only rows whose narrative ids are well-formed uuids are FK-safe.
  if (outputs.crossImpacts.length > 0) {
    try {
      const rows = outputs.crossImpacts
        .filter(
          (c) =>
            UUID_RE.test(c.sourceNarrativeId) && UUID_RE.test(c.targetNarrativeId),
        )
        .map((c) => ({
          source_narrative_id: c.sourceNarrativeId,
          target_narrative_id: c.targetNarrativeId,
          impact_type: c.impactType,
          impact_strength: c.impactStrength,
          confidence: c.confidence,
          reasoning: c.reasoning,
        }));
      if (rows.length > 0) {
        const { error } = await client
          .from('hsin_cross_narrative_impacts')
          .upsert(rows, {
            onConflict: 'source_narrative_id,target_narrative_id,impact_type',
          });
        if (!error) result.crossImpacts = rows.length;
        else
          logger.warn('decision.persist.crossImpacts.failed', {
            error: String(error),
          });
      }
    } catch (e) {
      logger.warn('decision.persist.crossImpacts.threw', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // (3) Audit — append-only audit_logs event. NEVER records a publish.
  try {
    const { error } = await client.from('audit_logs').insert({
      user_id: null,
      action: 'decision.pipeline',
      metadata: {
        decisionRuns: result.decisionRuns,
        rankings: result.rankings,
        comparisons: result.comparisons,
        crossImpacts: result.crossImpacts,
        audits: result.audits,
        at,
        autoPublished: false,
      },
    });
    result.audited = !error;
  } catch (e) {
    logger.warn('decision.persist.audit.threw', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return result;
};

/**
 * The registered decision pipeline job. Uses the DB loader/persister by default;
 * both degrade to a clean fixtures-run / no-op offline (no service-role env), so
 * this is fully offline-safe and never throws fatally.
 */
export const decisionWorkerJob: Job = makeDecisionWorkerJob();
