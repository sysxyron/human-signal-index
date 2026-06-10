// =============================================================================
// @hsi/outcome-intelligence — alerts.ts
//
// detectOutcomeAlerts(): threshold-gated, explainable, ADVISORY alerts. NEVER
// auto-acts — every alert is pure data with type + severity + message +
// explanation for a human reviewer. Pure & deterministic.
//
// THRESHOLDS (documented):
//   recommendation_failed  — evaluation.outcomeStatus === 'unsuccessful' AND
//                            successScore <= FAILED_SCORE (25). HIGH; CRITICAL
//                            when confidenceBefore was high (≥ HIGH_CONF 0.7).
//   confidence_drift       — learning.adjustment <= DRIFT_DOWN (−0.1). MEDIUM,
//                            HIGH when <= −0.2.
//   narrative_spike        — consecutive snapshot jump: signalCount up by ≥
//                            SPIKE_SIGNAL_PCT (50%) OR amplificationScore up by
//                            ≥ SPIKE_AMP (20). HIGH when both.
//   forecast_miss          — predicted !== actual. MEDIUM.
//   resurgence             — snapshots show a decline (drop ≥ RESURGE_DROP_PCT
//                            25%) FOLLOWED by a rise (≥ RESURGE_RISE_PCT 25%).
//                            HIGH.
//   security_anomaly       — any supplied security signal, severity mapped.
// =============================================================================

import type {
  ConfidenceLearningEntry,
  NarrativeSnapshot,
  OutcomeAlert,
  OutcomeAlertInput,
  OutcomeEvaluation,
} from './types';

const FAILED_SCORE = 25;
const HIGH_CONF = 0.7;
const DRIFT_DOWN = -0.1;
const DRIFT_DOWN_HARD = -0.2;
const SPIKE_SIGNAL_PCT = 50;
const SPIKE_AMP = 20;
const RESURGE_DROP_PCT = 25;
const RESURGE_RISE_PCT = 25;

type Severity = OutcomeAlert['severity'];

function pctChange(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return ((to - from) / Math.abs(from)) * 100;
}
function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function failedAlerts(evals: OutcomeEvaluation[], now: string): OutcomeAlert[] {
  const out: OutcomeAlert[] = [];
  for (const ev of evals) {
    if (ev.outcomeStatus !== 'unsuccessful' || ev.successScore > FAILED_SCORE) continue;
    const severity: Severity = ev.confidenceBefore >= HIGH_CONF ? 'CRITICAL' : 'HIGH';
    out.push({
      alertType: 'recommendation_failed',
      severity,
      message: `Recommendation ${ev.recommendationId} did not work (score ${ev.successScore}/100).`,
      explanation:
        `Outcome classified ${ev.outcomeStatus} with success score ${ev.successScore} ` +
        `(≤ ${FAILED_SCORE}). Stated confidence before was ${ev.confidenceBefore}; ` +
        `it was lowered to ${ev.confidenceAfter}. Review the recommendation and its ` +
        `assumptions before re-issuing.`,
      decisionRunId: ev.decisionRunId,
      metadata: { recommendationId: ev.recommendationId, successScore: ev.successScore },
      createdAt: now,
    });
  }
  return out;
}

function driftAlerts(learning: ConfidenceLearningEntry[], now: string): OutcomeAlert[] {
  const out: OutcomeAlert[] = [];
  for (const l of learning) {
    if (l.adjustment > DRIFT_DOWN) continue;
    const severity: Severity = l.adjustment <= DRIFT_DOWN_HARD ? 'HIGH' : 'MEDIUM';
    out.push({
      alertType: 'confidence_drift',
      severity,
      message: `Confidence for "${l.interventionType}" is drifting down (${l.adjustment}).`,
      explanation:
        `Learned confidence fell by ${Math.abs(l.adjustment)} to ${l.calibratedConfidence} ` +
        `after ${l.successCount}/${l.sampleCount} successes (avg score ${l.avgSuccessScore}). ` +
        `Stated confidence for this intervention type may be outrunning observed results.`,
      metadata: { interventionType: l.interventionType, adjustment: l.adjustment },
      createdAt: now,
    });
  }
  return out;
}

function snapshotAlerts(
  snapshots: NarrativeSnapshot[],
  now: string,
): OutcomeAlert[] {
  const out: OutcomeAlert[] = [];
  if (snapshots.length < 2) return out;
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt),
  );

  // narrative_spike: any consecutive jump beyond threshold.
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const sigPct = pctChange(prev.signalCount, cur.signalCount);
    const ampDelta = cur.amplificationScore - prev.amplificationScore;
    const sigSpike = sigPct >= SPIKE_SIGNAL_PCT;
    const ampSpike = ampDelta >= SPIKE_AMP;
    if (sigSpike || ampSpike) {
      const severity: Severity = sigSpike && ampSpike ? 'HIGH' : 'MEDIUM';
      out.push({
        alertType: 'narrative_spike',
        severity,
        message: `Narrative ${cur.narrativeId} spiked at ${cur.capturedAt}.`,
        explanation:
          `Signal volume changed ${round(sigPct)}% (${prev.signalCount} → ${cur.signalCount}) ` +
          `and amplification changed ${round(ampDelta)} ` +
          `(${prev.amplificationScore} → ${cur.amplificationScore}) between consecutive ` +
          `snapshots, exceeding the spike threshold.`,
        metadata: {
          narrativeId: cur.narrativeId,
          signalDeltaPct: round(sigPct),
          amplificationDelta: round(ampDelta),
        },
        createdAt: now,
      });
    }
  }

  // resurgence: a notable decline followed later by a notable rise.
  const signals = ordered.map((s) => s.signalCount);
  let minIdx = 0;
  for (let i = 1; i < signals.length; i++) {
    const declineFromStart = pctChange(signals[0], signals[i]);
    if (declineFromStart <= -RESURGE_DROP_PCT) {
      // found a trough candidate; check for a later rise from this trough.
      if (signals[i] < signals[minIdx] || minIdx === 0) minIdx = i;
    }
  }
  if (minIdx > 0 && minIdx < signals.length - 1) {
    const trough = signals[minIdx];
    const after = signals[signals.length - 1];
    const dropFromStart = pctChange(signals[0], trough);
    const riseFromTrough = pctChange(trough, after);
    if (dropFromStart <= -RESURGE_DROP_PCT && riseFromTrough >= RESURGE_RISE_PCT) {
      out.push({
        alertType: 'resurgence',
        severity: 'HIGH',
        message: `Narrative ${ordered[0].narrativeId} is resurging after a decline.`,
        explanation:
          `Signal volume declined ${round(dropFromStart)}% to a trough of ${trough} ` +
          `(${ordered[minIdx].capturedAt}) then rose ${round(riseFromTrough)}% to ${after}. ` +
          `A previously declining narrative is regaining momentum.`,
        metadata: {
          narrativeId: ordered[0].narrativeId,
          dropPct: round(dropFromStart),
          risePct: round(riseFromTrough),
        },
        createdAt: now,
      });
    }
  }
  return out;
}

function forecastAlerts(
  forecasts: { predicted: string; actual: string }[],
  now: string,
): OutcomeAlert[] {
  const out: OutcomeAlert[] = [];
  for (const f of forecasts) {
    if (f.predicted === f.actual) continue;
    out.push({
      alertType: 'forecast_miss',
      severity: 'MEDIUM',
      message: `Forecast missed: predicted "${f.predicted}", actual "${f.actual}".`,
      explanation:
        `The forecast state "${f.predicted}" did not match the observed state ` +
        `"${f.actual}". The forecasting model may need recalibration for this regime.`,
      metadata: { predicted: f.predicted, actual: f.actual },
      createdAt: now,
    });
  }
  return out;
}

function securityAlerts(
  signals: { type: string; severity: string }[],
  now: string,
): OutcomeAlert[] {
  const out: OutcomeAlert[] = [];
  for (const s of signals) {
    const sev = s.severity.toUpperCase();
    const severity: Severity =
      sev === 'CRITICAL'
        ? 'CRITICAL'
        : sev === 'HIGH'
          ? 'HIGH'
          : sev === 'MEDIUM'
            ? 'MEDIUM'
            : 'LOW';
    out.push({
      alertType: 'security_anomaly',
      severity,
      message: `Security anomaly detected: ${s.type}.`,
      explanation:
        `A security signal of type "${s.type}" (severity ${s.severity}) was reported. ` +
        `This is advisory only — escalate to a human reviewer; no automated action taken.`,
      metadata: { type: s.type, severity: s.severity },
      createdAt: now,
    });
  }
  return out;
}

/**
 * Detect all advisory alerts across the supplied evidence. Deterministic
 * ordering: failed → drift → spike/resurgence → forecast → security.
 */
export function detectOutcomeAlerts(input: OutcomeAlertInput): OutcomeAlert[] {
  const { now } = input;
  const alerts: OutcomeAlert[] = [
    ...failedAlerts(input.evaluations ?? [], now),
    ...driftAlerts(input.learning ?? [], now),
    ...snapshotAlerts(input.snapshots ?? [], now),
    ...forecastAlerts(input.forecasts ?? [], now),
    ...securityAlerts(input.securitySignals ?? [], now),
  ];
  return alerts;
}
