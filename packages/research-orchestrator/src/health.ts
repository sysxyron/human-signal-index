// =============================================================================
// @hsi/research-orchestrator — PLATFORM HEALTH MONITORING.
//
// computeEngineHealth() turns run/failure counts + queue depth into a HEALTHY /
// DEGRADED / DOWN status with success & failure rates. platformHealth() rolls up
// all ten monitored engines. Deterministic; pure.
//
// THRESHOLDS (documented):
//   DOWN     : failureRate ≥ 0.5 (with ≥2 runs), OR queueDepth ≥ DOWN_QUEUE.
//   DEGRADED : failureRate ≥ 0.2, OR queueDepth ≥ DEGRADED_QUEUE.
//   HEALTHY  : otherwise.
// An engine with zero runs and an empty queue is HEALTHY (idle, not unhealthy).
// =============================================================================

import type {
  EngineHealth,
  EngineHealthInput,
  EngineHealthStatus,
  EngineName,
} from './types';

export const DEGRADED_QUEUE = 25;
export const DOWN_QUEUE = 100;
export const DEGRADED_FAILURE_RATE = 0.2;
export const DOWN_FAILURE_RATE = 0.5;

/** The ten monitored engines, in display order. */
export const ENGINE_NAMES: EngineName[] = [
  'research',
  'evidence',
  'temporal',
  'causal',
  'counterfactual',
  'decision',
  'outcome',
  'calibration',
  'trust',
  'governance',
];

/** Compute one engine's health snapshot. Deterministic. */
export function computeEngineHealth(input: EngineHealthInput): EngineHealth {
  const runs = Math.max(0, input.runs ?? 0);
  const failures = Math.max(0, Math.min(runs, input.failures ?? 0));
  const queueDepth = Math.max(0, input.queueDepth ?? 0);
  const failureRate = runs > 0 ? Math.round((failures / runs) * 100) / 100 : 0;
  const successRate = runs > 0 ? Math.round(((runs - failures) / runs) * 100) / 100 : 1;

  let status: EngineHealthStatus = 'HEALTHY';
  if ((runs >= 2 && failureRate >= DOWN_FAILURE_RATE) || queueDepth >= DOWN_QUEUE) {
    status = 'DOWN';
  } else if (failureRate >= DEGRADED_FAILURE_RATE || queueDepth >= DEGRADED_QUEUE) {
    status = 'DEGRADED';
  }

  const detail =
    runs === 0 && queueDepth === 0
      ? 'Idle — no runs in the window.'
      : `${runs - failures}/${runs} succeeded (${Math.round(successRate * 100)}%), ` +
        `${failures} failed, queue depth ${queueDepth}.`;

  return {
    engine: input.engine,
    status,
    ...(input.lastRun ? { lastRun: input.lastRun } : {}),
    successRate,
    failureRate,
    queueDepth,
    detail,
  };
}

/**
 * Roll up health across all ten engines. Missing engines default to an idle
 * HEALTHY snapshot so the dashboard always shows the full set.
 */
export function platformHealth(inputs: EngineHealthInput[]): EngineHealth[] {
  const byName = new Map(inputs.map((i) => [i.engine, i]));
  return ENGINE_NAMES.map((engine) =>
    computeEngineHealth(byName.get(engine) ?? { engine }),
  );
}

/** The worst status across a set of engine-health snapshots. */
export function overallStatus(health: EngineHealth[]): EngineHealthStatus {
  if (health.some((h) => h.status === 'DOWN')) return 'DOWN';
  if (health.some((h) => h.status === 'DEGRADED')) return 'DEGRADED';
  return 'HEALTHY';
}
