// =============================================================================
// HSI Phase 63 — Source classification + detectors (PURE, no I/O).
//
// evaluateSourceHealth() classifies one source into the normalized state model
// (explainable: reason + evidence + recency). The detectors are EDGE-TRIGGERED —
// they fire on a transition INTO a condition (compared to the prior persisted
// state), so a still-failing source is not re-alerted every run.
// generateMonitoringAlerts() runs them in precedence (one alert per source/run).
//
// Reads only the Phase 61 reliability output (consumed as SourceSignal) + the
// prior monitoring snapshot. No scraping, no fetch, no ingestion calls.
// =============================================================================

import type { ReliabilitySource } from '@/lib/source-reliability';
import {
  type SourceSignal, type PriorState, type Classification, type MonitoringAlert,
  type AlertKind, type MonitorSeverity, type SourceState, isProblemState,
} from './types';
import {
  stalePolicy, bandRank, bandForScore, severityForFailure, severityForBlocked,
  severityForStale, severityForGap, severityForRegression, severityForRecovery,
} from './policy';

/** Normalize a Phase 61 ReliabilitySource into the monitoring input. */
export function toSignal(r: ReliabilitySource): SourceSignal {
  return {
    id: r.id, name: r.name, type: r.type, status: r.status, score: r.score, tier: r.tier,
    failureType: r.failureType, protection: r.protection, events: r.events, successPct: r.successPct,
    consecutiveFailures: r.consecutiveFailures, lastSuccessIso: r.lastSuccessIso,
    lastSuccessAgeDays: r.lastSuccessAgeDays, signals: r.signals,
  };
}

/** Classify a source into the normalized state model. Explainable. (Deliverable 2) */
export function evaluateSourceHealth(signal: SourceSignal, prior: PriorState | null, nowIso: string): Classification {
  const policy = stalePolicy(signal.type);
  const age = signal.lastSuccessAgeDays;
  const isStale = age != null && age > policy.days;
  const neverSucceeded = signal.lastSuccessIso == null;
  const blocked = signal.protection != null && signal.status !== 'HEALTHY';
  const unreachable = (signal.failureType === 'Offline' || signal.failureType === 'Timeout') && signal.status === 'FAILED';
  const priorState = prior?.state ?? null;
  const priorBad = priorState != null && isProblemState(priorState);

  let state: SourceState;
  let reason: string;

  if (signal.status === 'HEALTHY' && !blocked && !isStale) {
    if (priorBad) { state = 'RECOVERED'; reason = `Recovered to healthy (score ${signal.score}); previously ${priorState}.`; }
    else { state = 'HEALTHY'; reason = `Healthy — ${signal.successPct}% success, score ${signal.score}.`; }
  } else if (blocked) {
    state = 'BLOCKED'; reason = `Blocked by ${signal.protection} protection — reported, not bypassed.`;
  } else if (unreachable) {
    state = 'UNREACHABLE'; reason = `Unreachable — ${signal.failureType} after ${signal.consecutiveFailures} consecutive failure(s).`;
  } else if (signal.status === 'FAILED') {
    state = 'FAILED'; reason = `Failing — score ${signal.score}, ${signal.failureType}.`;
  } else if (isStale) {
    state = 'STALE'; reason = `No successful collection in ${age}d (policy ${policy.label}).`;
  } else if (signal.status === 'WARNING') {
    const dropped = prior?.score != null && bandRank(bandForScore(prior.score)) > bandRank(signal.tier);
    if (dropped) { state = 'DEGRADED'; reason = `Degraded — score ${prior?.score}→${signal.score} (${bandForScore(prior!.score!)}→${signal.tier}).`; }
    else { state = 'WARNING'; reason = `At risk — score ${signal.score}, ${signal.failureType}.`; }
  } else if (neverSucceeded && signal.events > 0) {
    state = 'STALE'; reason = `No successful collection on record across ${signal.events} attempt(s).`;
  } else {
    state = 'HEALTHY'; reason = `Healthy — score ${signal.score}.`;
  }

  const evidence: Record<string, unknown> = {
    score: signal.score, tier: signal.tier, successPct: signal.successPct, events: signal.events,
    consecutiveFailures: signal.consecutiveFailures, failureType: signal.failureType,
    protection: signal.protection, ageDays: age, policyDays: policy.days, policyLabel: policy.label,
  };
  const lastFailure = isProblemState(state) ? (prior?.lastFailureAt ?? nowIso) : (prior?.lastFailureAt ?? null);
  return { state, reason, evidence, score: signal.score, lastSuccess: signal.lastSuccessIso, lastFailure };
}

function mk(signal: SourceSignal, prior: PriorState | null, cls: Classification, kind: AlertKind, severity: MonitorSeverity, reason?: string): MonitoringAlert {
  return {
    sourceId: signal.id, sourceName: signal.name, sourceType: signal.type,
    kind, severity, state: cls.state, reason: reason ?? cls.reason, evidence: cls.evidence,
    scoreBefore: prior?.score ?? null, scoreAfter: signal.score,
    lastSuccess: cls.lastSuccess, lastFailure: cls.lastFailure,
  };
}

// ---- detectors (edge-triggered; each returns one alert or null) -------------

export function detectSourceRecovery(signal: SourceSignal, prior: PriorState | null, now: string): MonitoringAlert | null {
  const cls = evaluateSourceHealth(signal, prior, now);
  return cls.state === 'RECOVERED' ? mk(signal, prior, cls, 'SOURCE_RECOVERED', severityForRecovery()) : null;
}

export function detectSourceFailure(signal: SourceSignal, prior: PriorState | null, now: string): MonitoringAlert | null {
  const cls = evaluateSourceHealth(signal, prior, now);
  const ps = prior?.state ?? null;
  if (cls.state === 'BLOCKED' && ps !== 'BLOCKED') return mk(signal, prior, cls, 'SOURCE_BLOCKED', severityForBlocked(signal));
  if ((cls.state === 'FAILED' || cls.state === 'UNREACHABLE') && ps !== 'FAILED' && ps !== 'UNREACHABLE') {
    return mk(signal, prior, cls, 'SOURCE_FAILED', severityForFailure(signal));
  }
  return null;
}

export function detectStaleSource(signal: SourceSignal, prior: PriorState | null, now: string): MonitoringAlert | null {
  const cls = evaluateSourceHealth(signal, prior, now);
  if (cls.state !== 'STALE' || prior?.state === 'STALE') return null;
  const policy = stalePolicy(signal.type);
  return mk(signal, prior, cls, 'SOURCE_STALE', severityForStale(signal.lastSuccessAgeDays ?? policy.days, policy.days));
}

export function detectCollectionGap(signal: SourceSignal, prior: PriorState | null, now: string): MonitoringAlert | null {
  // A previously-active source with no capture attempts in the window goes silent.
  if (signal.events !== 0 || prior == null || (prior.score ?? 0) <= 0) return null;
  const cls = evaluateSourceHealth(signal, prior, now);
  return mk(signal, prior, cls, 'COLLECTION_GAP', severityForGap(), 'No capture attempts recorded in the monitoring window (source was previously active).');
}

export function detectReliabilityRegression(signal: SourceSignal, prior: PriorState | null, now: string): MonitoringAlert | null {
  if (prior?.score == null) return null;
  const dropped = bandRank(bandForScore(prior.score)) - bandRank(signal.tier);
  if (dropped < 1) return null;
  const cls = evaluateSourceHealth(signal, prior, now);
  const kind: AlertKind = dropped >= 2 ? 'RELIABILITY_DROP' : 'SOURCE_DEGRADED';
  return mk(signal, prior, cls, kind, severityForRegression(dropped),
    `Reliability ${prior.score}→${signal.score} (${bandForScore(prior.score)}→${signal.tier}); ${dropped} band(s) lower.`);
}

/**
 * One alert per source per run, by precedence:
 * recovery → failure/blocked → stale → collection gap → reliability regression.
 * Returns only sources with a fired alert (a transition or regression).
 */
export function generateMonitoringAlerts(signals: SourceSignal[], priorsById: Map<string, PriorState>, now: string): MonitoringAlert[] {
  const out: MonitoringAlert[] = [];
  for (const s of signals) {
    const prior = priorsById.get(s.id) ?? null;
    const alert =
      detectSourceRecovery(s, prior, now)
      ?? detectSourceFailure(s, prior, now)
      ?? detectStaleSource(s, prior, now)
      ?? detectCollectionGap(s, prior, now)
      ?? detectReliabilityRegression(s, prior, now);
    if (alert) out.push(alert);
  }
  return out;
}

/** Classify every source (for state persistence + the dashboard overview). */
export function classifyAll(signals: SourceSignal[], priorsById: Map<string, PriorState>, now: string): Map<string, Classification> {
  const m = new Map<string, Classification>();
  for (const s of signals) m.set(s.id, evaluateSourceHealth(s, priorsById.get(s.id) ?? null, now));
  return m;
}
