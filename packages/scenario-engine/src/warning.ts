// =============================================================================
// @hsi/scenario-engine — the EARLY WARNING detection layer.
//
// Six detectors over the platform's forward-looking signals, each returning an
// EarlyWarning (or null when nothing crosses threshold):
//   detectEmergingPatterns      — a cluster of co-occurring rising signals.
//   detectSignalAcceleration    — a signal's rate-of-change is accelerating.
//   detectTrustCollapse         — trust falling sharply over a window.
//   detectNarrativeShift        — a narrative's composition changing fast.
//   detectConsensusInstability  — consensus agreement swinging.
//   detectForecastRisk          — a high-confidence forecast at risk of failing.
//
// Each alert is INFO / WATCH / WARNING / CRITICAL. ADVISORY ONLY — never acts,
// never escalates, never asserts truth.
// =============================================================================

import { clamp01, round } from './scenario';
import type { EarlyWarning, WarningKind, WarningLevel } from './types';

/** Map a 0..1 severity to a warning level (documented thresholds). */
export function levelForSeverity(severity: number): WarningLevel {
  const s = clamp01(severity);
  if (s >= 0.75) return 'CRITICAL';
  if (s >= 0.5) return 'WARNING';
  if (s >= 0.25) return 'WATCH';
  return 'INFO';
}

function mkWarning(
  id: string,
  kind: WarningKind,
  severity: number,
  title: string,
  signal: string,
  evidence: string[],
  recommendation: string,
  now: string,
  entityId?: string,
): EarlyWarning {
  return { id, kind, level: levelForSeverity(severity), title, signal, evidence, recommendation, ...(entityId ? { entityId } : {}), detectedAt: now };
}

function slope(series: number[]): number {
  if (series.length < 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < series.length; i++) deltas.push(series[i] - series[i - 1]);
  return deltas.reduce((a, n) => a + n, 0) / deltas.length;
}
function stddev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const m = nums.reduce((a, n) => a + n, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, n) => a + (n - m) * (n - m), 0) / nums.length);
}

/**
 * Detect EMERGING patterns: a cluster of signals that are simultaneously rising
 * and strong. Severity scales with how many strong rising signals co-occur.
 */
export function detectEmergingPatterns(
  input: { id: string; signals: Array<{ label: string; strength: number; rising: boolean }> },
  opts: { now: string },
): EarlyWarning | null {
  const strongRising = input.signals.filter((s) => s.rising && clamp01(s.strength) >= 0.6);
  if (strongRising.length < 2) return null;
  const severity = clamp01(strongRising.length / 5 + (strongRising.reduce((a, s) => a + s.strength, 0) / strongRising.length) * 0.3);
  return mkWarning(
    input.id, 'emerging_pattern', severity,
    'Emerging pattern detected',
    `${strongRising.length} strong rising signals are co-occurring.`,
    strongRising.map((s) => `${s.label}: strength ${Math.round(s.strength * 100)}%`),
    'Open or update a scenario; monitor whether the pattern consolidates. Advisory only.',
    opts.now, input.id,
  );
}

/**
 * Detect SIGNAL ACCELERATION: the second difference of a value series is
 * positive (rate of change increasing). Severity scales with acceleration.
 */
export function detectSignalAcceleration(
  input: { id: string; label: string; series: number[] },
  opts: { now: string },
): EarlyWarning | null {
  if (input.series.length < 3) return null;
  const firstHalf = slope(input.series.slice(0, Math.ceil(input.series.length / 2)));
  const secondHalf = slope(input.series.slice(Math.floor(input.series.length / 2)));
  const acceleration = secondHalf - firstHalf;
  if (acceleration <= 0) return null;
  const severity = clamp01(acceleration / (Math.abs(firstHalf) + 1));
  return mkWarning(
    input.id, 'signal_acceleration', severity,
    'Signal acceleration',
    `"${input.label}" is accelerating (slope ${round(firstHalf, 2)} → ${round(secondHalf, 2)}).`,
    [`early slope ${round(firstHalf, 2)}`, `recent slope ${round(secondHalf, 2)}`, `acceleration ${round(acceleration, 2)}`],
    'Treat as an early indicator; verify before acting. Advisory only.',
    opts.now, input.id,
  );
}

/**
 * Detect TRUST COLLAPSE: a trust series (0..100) falling sharply over the window.
 * Severity scales with the drop magnitude.
 */
export function detectTrustCollapse(
  input: { id: string; trustSeries: number[]; dropThreshold?: number },
  opts: { now: string },
): EarlyWarning | null {
  const threshold = input.dropThreshold ?? 15;
  if (input.trustSeries.length < 2) return null;
  const first = input.trustSeries[0];
  const last = input.trustSeries[input.trustSeries.length - 1];
  const drop = first - last;
  if (drop < threshold) return null;
  const severity = clamp01(drop / 50);
  return mkWarning(
    input.id, 'trust_collapse', severity,
    'Trust collapse risk',
    `Trust fell ${Math.round(drop)} points (${Math.round(first)} → ${Math.round(last)}).`,
    [`from ${Math.round(first)}`, `to ${Math.round(last)}`, `drop ${Math.round(drop)} ≥ ${threshold}`],
    'Route to trust governance and consider a recalibration proposal. Advisory only.',
    opts.now, input.id,
  );
}

/**
 * Detect NARRATIVE SHIFT: a composition vector changing fast between two
 * snapshots (mean absolute change in shares). Severity scales with the shift.
 */
export function detectNarrativeShift(
  input: { id: string; before: number[]; after: number[]; shiftThreshold?: number },
  opts: { now: string },
): EarlyWarning | null {
  const threshold = input.shiftThreshold ?? 0.2;
  const n = Math.min(input.before.length, input.after.length);
  if (n === 0) return null;
  let totalShift = 0;
  for (let i = 0; i < n; i++) totalShift += Math.abs(clamp01(input.after[i]) - clamp01(input.before[i]));
  const meanShift = totalShift / n;
  if (meanShift < threshold) return null;
  const severity = clamp01(meanShift / 0.5);
  return mkWarning(
    input.id, 'narrative_shift', severity,
    'Narrative shift',
    `Narrative composition shifted by ${Math.round(meanShift * 100)}% on average.`,
    [`mean share change ${round(meanShift, 2)} ≥ ${threshold}`],
    'Investigate the driver of the shift; consider opening a scenario. Advisory only.',
    opts.now, input.id,
  );
}

/**
 * Detect CONSENSUS INSTABILITY: a consensus-agreement series swinging (high
 * step-change volatility). Severity scales with the volatility.
 */
export function detectConsensusInstability(
  input: { id: string; agreementSeries: number[]; volatilityThreshold?: number },
  opts: { now: string },
): EarlyWarning | null {
  const threshold = input.volatilityThreshold ?? 0.15;
  if (input.agreementSeries.length < 3) return null;
  const deltas: number[] = [];
  for (let i = 1; i < input.agreementSeries.length; i++) deltas.push(input.agreementSeries[i] - input.agreementSeries[i - 1]);
  const vol = stddev(deltas);
  if (vol < threshold) return null;
  const severity = clamp01(vol / 0.4);
  return mkWarning(
    input.id, 'consensus_instability', severity,
    'Consensus instability',
    `Consensus agreement is swinging (volatility ${round(vol, 2)}).`,
    [`step-change stddev ${round(vol, 2)} ≥ ${threshold}`],
    'Hold governance decisions until the consensus stabilises. Advisory only.',
    opts.now, input.id,
  );
}

/**
 * Detect FORECAST RISK: a high-confidence forecast whose reliability is low or
 * whose recent supporting signal has weakened. Severity scales with the gap.
 */
export function detectForecastRisk(
  input: { id: string; confidence: number; reliability: number; signalWeakening?: boolean },
  opts: { now: string },
): EarlyWarning | null {
  const conf = clamp01(input.confidence);
  const rel = clamp01(input.reliability);
  const gap = conf - rel;
  const weakening = input.signalWeakening === true;
  if (gap < 0.2 && !weakening) return null;
  const severity = clamp01(Math.max(gap, weakening ? 0.5 : 0));
  return mkWarning(
    input.id, 'forecast_risk', severity,
    'Forecast at risk',
    `High confidence (${Math.round(conf * 100)}%) but ${weakening ? 'weakening signals' : `low reliability (${Math.round(rel * 100)}%)`}.`,
    [`confidence ${Math.round(conf * 100)}%`, `reliability ${Math.round(rel * 100)}%`, `gap ${round(gap, 2)}`, ...(weakening ? ['supporting signals weakening'] : [])],
    'Review the forecast assumptions + invalidation criteria before relying on it. Advisory only.',
    opts.now, input.id,
  );
}

/** Order warnings by level (CRITICAL first) then recency. */
export function orderWarnings(warnings: EarlyWarning[]): EarlyWarning[] {
  const rank: Record<WarningLevel, number> = { CRITICAL: 0, WARNING: 1, WATCH: 2, INFO: 3 };
  return warnings.slice().sort((a, b) => rank[a.level] - rank[b.level] || b.detectedAt.localeCompare(a.detectedAt) || a.id.localeCompare(b.id));
}
