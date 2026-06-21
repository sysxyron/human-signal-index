// =============================================================================
// HSI Phase 74 — Early-warning engine (PURE, deterministic). Eight explainable
// rules turn REAL metrics into ExecutiveAlerts. Each rule has documented
// thresholds; each alert's summary states the trigger and the numbers behind it
// (traceable, reproducible). No AI scoring, no fabricated metrics. No I/O.
// =============================================================================

import type { ExecutiveAlert, AlertSeverity, AlertType } from './types';

export interface WarningInputs {
  narrativeNewRecent: number; narrativeNewPrior: number;   // surge (last 7d vs prior window)
  topContradiction: { key: string; contradicts: number; supports: number } | null;
  blindSpotCount: number; narrativesMissingEvidence: number;
  forecastDiverging: number; forecastMissed: number;
  trustLow: number; trustObserved: number;
  regionsWithNarratives: number;
  reviewBacklog: number;
  sourcesOffline: number; sourcesTotal: number;
}

const SEV_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
export function severityRank(s: AlertSeverity): number { return SEV_RANK[s]; }

function alert(type: AlertType, severity: AlertSeverity, title: string, summary: string, counts: Partial<Pick<ExecutiveAlert, 'sourceCount' | 'signalCount' | 'narrativeCount' | 'regionCount'>>, nowIso: string): ExecutiveAlert {
  return { id: `exec-${type.toLowerCase()}`, type, severity, title, summary, sourceCount: counts.sourceCount ?? 0, signalCount: counts.signalCount ?? 0, narrativeCount: counts.narrativeCount ?? 0, regionCount: counts.regionCount ?? 0, status: 'OPEN', createdAt: nowIso };
}

// ---- individual rules (each null when not triggered) -----------------------

export function narrativeSurge(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  if (i.narrativeNewRecent < 3 || i.narrativeNewRecent <= i.narrativeNewPrior * 1.5) return null;
  const sev: AlertSeverity = i.narrativeNewRecent >= 10 ? 'HIGH' : 'MEDIUM';
  return alert('NARRATIVE_SURGE', sev, 'Narrative surge', `${i.narrativeNewRecent} new narratives in the recent window vs ${i.narrativeNewPrior} prior (>1.5× baseline).`, { narrativeCount: i.narrativeNewRecent }, nowIso);
}

export function contradictionSpike(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  const c = i.topContradiction; if (!c || c.contradicts < 5) return null;
  const sev: AlertSeverity = c.contradicts >= 10 ? 'HIGH' : 'MEDIUM';
  return alert('CONTRADICTION_SPIKE', sev, 'Contradiction spike', `${c.contradicts} contradicting vs ${c.supports} supporting edges in ${c.key} (threshold 5).`, { regionCount: 1 }, nowIso);
}

export function evidenceGap(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  const total = i.narrativesMissingEvidence + i.blindSpotCount; if (total < 1) return null;
  const sev: AlertSeverity = total >= 5 ? 'HIGH' : total >= 2 ? 'MEDIUM' : 'LOW';
  return alert('EVIDENCE_GAP', sev, 'Evidence gap', `${i.narrativesMissingEvidence} narrative(s) and ${i.blindSpotCount} region(s) have activity but no corroborating evidence.`, { narrativeCount: i.narrativesMissingEvidence, regionCount: i.blindSpotCount }, nowIso);
}

export function forecastDivergence(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  const total = i.forecastDiverging + i.forecastMissed; if (total < 1) return null;
  const sev: AlertSeverity = i.forecastMissed >= 3 ? 'HIGH' : total >= 3 ? 'MEDIUM' : 'LOW';
  return alert('FORECAST_DIVERGENCE', sev, 'Forecast divergence', `${i.forecastDiverging} diverging and ${i.forecastMissed} missed forecast(s) relative to recorded outcomes.`, {}, nowIso);
}

export function trustDegradation(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  if (i.trustObserved <= 0 || i.trustLow < 1) return null;
  const ratio = i.trustLow / i.trustObserved;
  const sev: AlertSeverity = ratio >= 0.3 ? 'HIGH' : ratio >= 0.1 ? 'MEDIUM' : 'LOW';
  return alert('TRUST_DEGRADATION', sev, 'Trust degradation', `${i.trustLow} of ${i.trustObserved} scored sources are in the low-trust band (${Math.round(ratio * 100)}%).`, { sourceCount: i.trustLow }, nowIso);
}

export function geoExpansion(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  if (i.regionsWithNarratives < 5) return null;
  const sev: AlertSeverity = i.regionsWithNarratives >= 12 ? 'LOW' : 'INFO';
  return alert('GEO_EXPANSION', sev, 'Geographic expansion', `Narrative activity now spans ${i.regionsWithNarratives} regions (broad geographic footprint).`, { regionCount: i.regionsWithNarratives }, nowIso);
}

export function reviewBacklog(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  if (i.reviewBacklog <= 10) return null;
  const sev: AlertSeverity = i.reviewBacklog > 100 ? 'CRITICAL' : i.reviewBacklog > 50 ? 'HIGH' : 'MEDIUM';
  return alert('REVIEW_BACKLOG', sev, 'Review backlog', `${i.reviewBacklog} items awaiting review (threshold 10).`, { signalCount: i.reviewBacklog }, nowIso);
}

export function sourceFailure(i: WarningInputs, nowIso: string): ExecutiveAlert | null {
  if (i.sourcesTotal <= 0 || i.sourcesOffline < 1) return null;
  const ratio = i.sourcesOffline / i.sourcesTotal;
  const sev: AlertSeverity = ratio >= 0.3 ? 'CRITICAL' : ratio >= 0.15 ? 'HIGH' : ratio >= 0.05 ? 'MEDIUM' : 'LOW';
  return alert('SOURCE_FAILURE', sev, 'Source collection failure', `${i.sourcesOffline} of ${i.sourcesTotal} sources are offline or blocked (${Math.round(ratio * 100)}%).`, { sourceCount: i.sourcesOffline }, nowIso);
}

const RULES = [narrativeSurge, contradictionSpike, evidenceGap, forecastDivergence, trustDegradation, geoExpansion, reviewBacklog, sourceFailure];

/** Run every rule; return triggered alerts, worst severity first (then type). */
export function buildAlerts(inputs: WarningInputs, nowIso: string): ExecutiveAlert[] {
  return RULES.map((r) => r(inputs, nowIso)).filter((a): a is ExecutiveAlert => a !== null)
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.type.localeCompare(b.type));
}
