import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyDivergence, summarizeDivergence, toDivergenceRow, type DivergenceInput } from './divergence';
import { buildAlerts, narrativeSurge, contradictionSpike, trustDegradation, sourceFailure, reviewBacklog, type WarningInputs } from './warnings';
import { computeRisks, overallRisk, type RiskInputs } from './risk';
import { buildExecutiveBrief, type BriefInputs } from './brief';
import { ALERT_TYPES, ALERT_SEVERITIES, RISK_CATEGORIES } from './types';

const NOW = '2026-06-20T00:00:00.000Z';
const daysAgo = (d: number) => new Date(new Date(NOW).getTime() - d * 86400000).toISOString();
const daysAhead = (d: number) => new Date(new Date(NOW).getTime() + d * 86400000).toISOString();

// ---- forecast divergence ---------------------------------------------------

function div(over: Partial<DivergenceInput>): DivergenceInput {
  return { id: 'f', title: 'F', owner: 'x', confidence: 0.6, outcome: null, status: 'active', scoreResult: null, forecastDateIso: daysAgo(10), resolutionDateIso: daysAhead(10), nowIso: NOW, ...over };
}
test('divergence: resolved results map deterministically', () => {
  assert.equal(classifyDivergence(div({ status: 'resolved', scoreResult: 'correct' })), 'on_track');
  assert.equal(classifyDivergence(div({ status: 'resolved', scoreResult: 'partial' })), 'diverging');
  assert.equal(classifyDivergence(div({ status: 'resolved', scoreResult: 'incorrect' })), 'missed');
  assert.equal(classifyDivergence(div({ status: 'resolved', scoreResult: null })), 'unresolved');
});
test('divergence: active overdue → diverging; in-progress → on_track; expired → missed', () => {
  assert.equal(classifyDivergence(div({ status: 'active', resolutionDateIso: daysAgo(1) })), 'diverging');
  assert.equal(classifyDivergence(div({ status: 'active', resolutionDateIso: daysAhead(5) })), 'on_track');
  assert.equal(classifyDivergence(div({ status: 'expired' })), 'missed');
  assert.equal(classifyDivergence(div({ status: 'draft' })), 'unresolved');
});
test('divergence: row carries age + summary counts', () => {
  const r = toDivergenceRow(div({ status: 'resolved', scoreResult: 'correct', forecastDateIso: daysAgo(20) }));
  assert.equal(r.status, 'on_track'); assert.equal(r.ageDays, 20);
  const s = summarizeDivergence([r, toDivergenceRow(div({ status: 'expired' }))]);
  assert.equal(s.total, 2); assert.equal(s.onTrack, 1); assert.equal(s.missed, 1);
});

// ---- early warnings --------------------------------------------------------

function wi(over: Partial<WarningInputs> = {}): WarningInputs {
  return { narrativeNewRecent: 0, narrativeNewPrior: 0, topContradiction: null, blindSpotCount: 0, narrativesMissingEvidence: 0, forecastDiverging: 0, forecastMissed: 0, trustLow: 0, trustObserved: 0, regionsWithNarratives: 0, reviewBacklog: 0, sourcesOffline: 0, sourcesTotal: 0, ...over };
}
test('warnings: no triggers → empty (no fabricated alerts)', () => {
  assert.deepEqual(buildAlerts(wi(), NOW), []);
});
test('narrativeSurge: only when recent ≥3 and >1.5× prior', () => {
  assert.equal(narrativeSurge(wi({ narrativeNewRecent: 5, narrativeNewPrior: 1 }), NOW)?.type, 'NARRATIVE_SURGE');
  assert.equal(narrativeSurge(wi({ narrativeNewRecent: 2, narrativeNewPrior: 0 }), NOW), null); // below floor
  assert.equal(narrativeSurge(wi({ narrativeNewRecent: 4, narrativeNewPrior: 4 }), NOW), null); // not above baseline
});
test('contradictionSpike: threshold 5, HIGH at 10', () => {
  assert.equal(contradictionSpike(wi({ topContradiction: { key: 'US', contradicts: 4, supports: 1 } }), NOW), null);
  assert.equal(contradictionSpike(wi({ topContradiction: { key: 'US', contradicts: 6, supports: 1 } }), NOW)?.severity, 'MEDIUM');
  assert.equal(contradictionSpike(wi({ topContradiction: { key: 'US', contradicts: 12, supports: 1 } }), NOW)?.severity, 'HIGH');
});
test('trustDegradation: ratio-based severity', () => {
  assert.equal(trustDegradation(wi({ trustLow: 4, trustObserved: 10 }), NOW)?.severity, 'HIGH');   // 0.4
  assert.equal(trustDegradation(wi({ trustLow: 1, trustObserved: 10 }), NOW)?.severity, 'MEDIUM'); // 0.1
  assert.equal(trustDegradation(wi({ trustLow: 0, trustObserved: 10 }), NOW), null);
});
test('sourceFailure: ratio severity incl CRITICAL', () => {
  assert.equal(sourceFailure(wi({ sourcesOffline: 4, sourcesTotal: 10 }), NOW)?.severity, 'CRITICAL'); // 0.4
  assert.equal(sourceFailure(wi({ sourcesOffline: 1, sourcesTotal: 20 }), NOW)?.severity, 'MEDIUM');   // 0.05
  assert.equal(sourceFailure(wi({ sourcesOffline: 0, sourcesTotal: 20 }), NOW), null);
});
test('reviewBacklog: thresholds', () => {
  assert.equal(reviewBacklog(wi({ reviewBacklog: 5 }), NOW), null);
  assert.equal(reviewBacklog(wi({ reviewBacklog: 30 }), NOW)?.severity, 'MEDIUM');
  assert.equal(reviewBacklog(wi({ reviewBacklog: 120 }), NOW)?.severity, 'CRITICAL');
});
test('buildAlerts: sorted worst-first; every alert traceable + reproducible', () => {
  const alerts = buildAlerts(wi({ sourcesOffline: 4, sourcesTotal: 10, reviewBacklog: 30, trustLow: 1, trustObserved: 10 }), NOW);
  assert.equal(alerts[0].severity, 'CRITICAL'); // source failure
  for (const a of alerts) {
    assert.ok((ALERT_TYPES as readonly string[]).includes(a.type));
    assert.ok((ALERT_SEVERITIES as readonly string[]).includes(a.severity));
    assert.equal(a.status, 'OPEN');
    assert.ok(a.summary.length > 0 && a.createdAt === NOW);
  }
  // reproducible: same inputs → same alerts
  assert.deepEqual(alerts, buildAlerts(wi({ sourcesOffline: 4, sourcesTotal: 10, reviewBacklog: 30, trustLow: 1, trustObserved: 10 }), NOW));
});

// ---- risk monitoring -------------------------------------------------------

function ri(over: Partial<RiskInputs> = {}): RiskInputs {
  return { narrativesMissingEvidence: 0, narrativesTotal: 0, signalsWithEvidence: 0, totalSignals: 0, trustLow: 0, trustObserved: 0, forecastDiverging: 0, forecastMissed: 0, forecastTotal: 0, attentionCritical: 0, sourcesOffline: 0, sourcesTotal: 0, reviewBacklog: 0, geoReady: 0, sourcesAll: 0, ...over };
}
test('computeRisks: 8 categories; transparent detail; worst-of overall', () => {
  const cards = computeRisks(ri({ sourcesOffline: 5, sourcesTotal: 10, reviewBacklog: 60, geoReady: 0, sourcesAll: 100 }));
  assert.equal(cards.length, 8);
  for (const c of cards) { assert.ok((RISK_CATEGORIES as readonly string[]).includes(c.category)); assert.ok(c.detail.length > 0); }
  assert.equal(cards.find((c) => c.category === 'collection')?.status, 'RED'); // 0.5 offline
  assert.equal(cards.find((c) => c.category === 'review')?.status, 'RED');      // 60 > 50
  assert.equal(overallRisk(cards), 'RED');
});
test('computeRisks: empty universe is not falsely green/red', () => {
  const cards = computeRisks(ri());
  // ratioStatus(0,0)=YELLOW (geo/evidence), inverseRatioStatus(0,0)=GREEN, backlog(0)=GREEN
  assert.equal(cards.find((c) => c.category === 'geo')?.status, 'YELLOW');
  assert.equal(cards.find((c) => c.category === 'collection')?.status, 'GREEN');
});

// ---- executive brief -------------------------------------------------------

function bi(over: Partial<BriefInputs> = {}): BriefInputs {
  return { nowIso: NOW, newLast7: { sources: 0, signals: 0, narratives: 0, evidence: 0, forecasts: 0 }, newPrior: { sources: 0, signals: 0, narratives: 0, evidence: 0, forecasts: 0 }, reviewBacklog: 0, forecastDiverging: 0, forecastMissed: 0, forecastUnresolved: 0, trustLow: 0, trustObserved: 0, blindSpotRegions: [], narrativesMissingEvidence: 0, alerts: [], ...over };
}
test('brief: seven sections, facts only, no-change fallback', () => {
  const b = buildExecutiveBrief(bi());
  assert.equal(b.sections.length, 7);
  assert.ok(b.sections.every((s) => s.lines.length > 0));
  assert.ok(b.sections[0].lines[0] === 'No notable change.');
});
test('brief: accelerating vs slowing from real deltas', () => {
  const b = buildExecutiveBrief(bi({ newLast7: { sources: 5, signals: 2, narratives: 0, evidence: 0, forecasts: 0 }, newPrior: { sources: 2, signals: 9, narratives: 0, evidence: 0, forecasts: 0 } }));
  const accel = b.sections.find((s) => s.heading === 'What is accelerating?');
  const slow = b.sections.find((s) => s.heading === 'What is slowing?');
  assert.ok(accel?.lines.some((l) => l.startsWith('sources')));
  assert.ok(slow?.lines.some((l) => l.startsWith('signals')));
});
