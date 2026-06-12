// =============================================================================
// apps/worker/jobs — forecastWorkerJob (WorldForge/HSI Phase 21)
//
// The FORWARD-LOOKING loop. Every 30 minutes it recomputes forecast reliability
// from observed outcomes, refreshes scenario likelihoods, and detects early
// warnings — in fault-isolated, retry-safe, deterministic, offline-safe steps
// (each wrapped — a failure logs + continues; NEVER throws):
//
//   1. LOAD       — forecast outcomes + active scenarios.
//   2. RELIABILITY— recompute accuracy / calibration (ECE) / Brier from outcomes.
//   3. SCENARIOS  — recompute each scenario's likelihood from its drivers.
//   4. WARNINGS   — detect forecast-risk early warnings for active forecasts.
//   5. PERSIST    — write the reliability rollup + warnings; flag for human review.
//
// PURITY: the engines (@hsi/forecast-engine, @hsi/scenario-engine) are pure &
// deterministic; `now` is INJECTED (ctx.runAt). OFFLINE-SAFE: no service-role env
// → runs the fixtures + logs, no writes. GOVERNANCE: autoPredict/autoAct/
// autoEscalate/autoPublish = false — every forecast/warning is advisory.
//
// SCHEDULING: cron '*/30 * * * *' (every 30 minutes).
// =============================================================================

import {
  computeForecastAccuracy,
  computeForecastBrierScore,
  computeForecastCalibration,
  forecastDemo,
  type ForecastOutcome,
} from '@hsi/forecast-engine';
import {
  computeScenarioLikelihood,
  detectForecastRisk,
  scenarioDemo,
} from '@hsi/scenario-engine';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';
import type { Job, JobContext, JobResult } from './types';

export interface ForecastWorkerResult {
  mode: 'db' | 'offline';
  outcomes: number;
  reliabilityComputed: boolean;
  scenariosUpdated: number;
  warnings: number;
  pendingReview: number;
}

type FcQuery = {
  eq: (col: string, val: unknown) => FcQuery;
  in: (col: string, vals: unknown[]) => FcQuery;
  order: (col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) => FcQuery;
  limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
};
interface FcClient {
  from(table: string): {
    select: (cols?: string) => FcQuery;
    insert: (values: unknown) => Promise<{ data: unknown; error: unknown }>;
    update: (values: unknown) => { eq: (col: string, val: unknown) => Promise<{ error: unknown }> };
  };
}

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function tryClient(): FcClient | null {
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as FcClient;
  } catch (e) {
    logger.warn('forecast.serviceRole.unavailable', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/**
 * Run the forecast loop. Deterministic (`now` injected). Offline-safe. NEVER
 * throws. Returns the counts.
 */
export async function runForecastStage(now: string, opts?: { client?: FcClient | null }): Promise<ForecastWorkerResult> {
  const client = opts?.client !== undefined ? opts.client : tryClient();
  if (!client) return offlineResult(now);

  const result: ForecastWorkerResult = { mode: 'db', outcomes: 0, reliabilityComputed: false, scenariosUpdated: 0, warnings: 0, pendingReview: 0 };

  // --- Step 1-2: reliability from outcomes -----------------------------------
  try {
    const { data } = await client.from('hsin_forecast_outcomes').select('forecast_id, confidence, success').limit(20000);
    const outcomes: ForecastOutcome[] = ((data ?? []) as Array<{ forecast_id?: string; confidence?: number; success?: number }>)
      .filter((o) => typeof o.confidence === 'number' && typeof o.success === 'number')
      .map((o) => ({ forecastId: String(o.forecast_id ?? ''), confidence: clamp01(o.confidence as number), success: clamp01(o.success as number) }));
    result.outcomes = outcomes.length;
    if (outcomes.length > 0) {
      const accuracy = computeForecastAccuracy(outcomes);
      const calibration = computeForecastCalibration(outcomes);
      const brier = computeForecastBrierScore(outcomes);
      const { error } = await client.from('hsin_forecast_accuracy').insert({
        scope: 'overall', success_rate: accuracy.successRate, failure_rate: accuracy.failureRate,
        ece: calibration.ece, brier_score: brier.score, drift: 0, sample_count: outcomes.length,
        bins: { items: calibration.bins }, computed_at: now,
      });
      result.reliabilityComputed = !error;
    }
  } catch (e) {
    logger.warn('forecast.reliability.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- Step 3: refresh scenario likelihoods ----------------------------------
  try {
    const { data } = await client.from('hsin_scenarios').select('id, drivers, likelihood').in('state', ['EMERGING', 'ACTIVE', 'MONITORING']).limit(2000);
    for (const s of (data ?? []) as Array<{ id?: string; drivers?: unknown }>) {
      const id = String(s.id ?? '');
      if (!id) continue;
      const drivers = readDrivers(s.drivers);
      const likelihood = computeScenarioLikelihood(drivers);
      const { error } = await client.from('hsin_scenarios').update({ likelihood }).eq('id', id);
      if (!error) result.scenariosUpdated += 1;
    }
  } catch (e) {
    logger.warn('forecast.scenarios.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  // --- Step 4-5: forecast-risk early warnings --------------------------------
  try {
    const { data } = await client.from('hsin_forecasts').select('id, confidence, reliability').eq('status', 'active').limit(2000);
    for (const f of (data ?? []) as Array<{ id?: string; confidence?: number; reliability?: number }>) {
      const id = String(f.id ?? '');
      if (!id) continue;
      const w = detectForecastRisk({ id, confidence: num(f.confidence, 0.5), reliability: num(f.reliability, 0.5) }, { now });
      if (!w) continue;
      const { error } = await client.from('hsin_early_warning_alerts').insert({
        kind: w.kind, level: w.level, title: w.title, signal: w.signal, evidence: { items: w.evidence },
        recommendation: w.recommendation, entity_id: w.entityId ?? id, status: 'open', detected_at: w.detectedAt,
      });
      if (!error) {
        result.warnings += 1;
        if (w.level === 'WARNING' || w.level === 'CRITICAL') result.pendingReview += 1;
      }
    }
  } catch (e) {
    logger.warn('forecast.warnings.failed', { error: e instanceof Error ? e.message : String(e) });
  }

  logger.info('forecast.done', { ...result, autoPredict: false, autoAct: false, autoEscalate: false, autoPublish: false });
  return result;
}

function readDrivers(value: unknown): { label: string; weight: number; presence: number }[] {
  const raw = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as Record<string, unknown>).items : undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ label: String(r.label ?? ''), weight: clamp01(num(r.weight, 0)), presence: clamp01(num(r.presence, 0)) }));
}

/** Offline-safe result: run the fixtures, log, persist nothing. */
function offlineResult(now: string): ForecastWorkerResult {
  const fc = forecastDemo();
  const sc = scenarioDemo();
  const result: ForecastWorkerResult = {
    mode: 'offline',
    outcomes: fc.accuracy.sampleCount,
    reliabilityComputed: true,
    scenariosUpdated: sc.scenarios.length,
    warnings: sc.warnings.length,
    pendingReview: sc.warnings.filter((w) => w.level === 'WARNING' || w.level === 'CRITICAL').length,
  };
  logger.info('forecast.offline', { ...result, autoPredict: false, autoAct: false, autoEscalate: false, autoPublish: false });
  return result;
}

/** The Job wrapper (every 30 minutes). */
export function makeForecastWorkerJob(): Job {
  return {
    name: 'forecastWorker',
    description:
      'Every 30 min: recompute forecast reliability (accuracy/ECE/Brier) from outcomes, refresh scenario likelihoods, and detect early warnings. NEVER auto-predicts/auto-acts/auto-escalates/auto-publishes — every forecast is a hypothesis for human review.',
    schedule: '*/30 * * * *',
    async run(ctx: JobContext): Promise<JobResult> {
      const now = ctx.runAt;
      const offline = !serviceRoleConfigured();
      const declaredInputs = { mode: offline ? 'offline-fixtures' : 'db', runAt: now, autoPredict: false, autoAct: false, autoEscalate: false, autoPublish: false };
      logger.info('job.forecastWorker.start', { declaredInputs });

      let summary: ForecastWorkerResult;
      try {
        summary = await runForecastStage(now);
      } catch (e) {
        logger.warn('job.forecastWorker.failed', { error: e instanceof Error ? e.message : String(e) });
        summary = { mode: offline ? 'offline' : 'db', outcomes: 0, reliabilityComputed: false, scenariosUpdated: 0, warnings: 0, pendingReview: 0 };
      }

      logger.info('job.forecastWorker.done', { summary, autoPredict: false, autoAct: false });
      return { job: 'forecastWorker', ok: true, declaredInputs, summary: { ...summary, autoPredict: false, autoAct: false, autoEscalate: false, autoPublish: false } };
    },
  };
}

/** The registered Phase-21 forecast job instance. */
export const forecastWorkerJob: Job = makeForecastWorkerJob();
