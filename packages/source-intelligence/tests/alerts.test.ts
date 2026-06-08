import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAlerts } from '../src/alerts';
import type { ChangeResult, NarrativeDriftEvent, SignalDraft, WatchlistMatch } from '../src/types';

const NOW = '2026-01-01T00:00:00.000Z';

const signal: SignalDraft = {
  title: 'Extinctionism overview',
  contentHash: 'h',
  signalType: 'article',
  signalCategory: 'extinction',
  confidence: 0.8,
  capturedAt: NOW,
};

test('generateAlerts: new signal => alert with explanation', () => {
  const alerts = generateAlerts({ signal, now: NOW });
  const ns = alerts.find((a) => a.alertType === 'new_signal');
  assert.ok(ns);
  assert.equal(ns!.severity, 'MEDIUM'); // confidence >= 0.7
  assert.ok(ns!.explanation.length > 0);
});

test('generateAlerts: narrative_shift => HIGH with explanation', () => {
  const drift: NarrativeDriftEvent = {
    before: 'a',
    after: 'b',
    explanation: 'drift explanation',
    confidence: 0.7,
    driftScore: 0.5,
    detectedAt: NOW,
  };
  const alerts = generateAlerts({ drift, now: NOW });
  const shift = alerts.find((a) => a.alertType === 'narrative_shift');
  assert.ok(shift);
  assert.equal(shift!.severity, 'HIGH');
  assert.ok(shift!.explanation.includes('drift explanation'));
});

test('generateAlerts: watchlist_match uses watchlist severity', () => {
  const matches: WatchlistMatch[] = [
    { watchlistName: 'Extinctionism', matchedTerms: ['human extinction'], score: 0.5, severity: 'HIGH' },
  ];
  const alerts = generateAlerts({ signal, watchlistMatches: matches, now: NOW });
  const wm = alerts.find((a) => a.alertType === 'watchlist_match');
  assert.ok(wm);
  assert.equal(wm!.severity, 'HIGH');
  // High-confidence signal + HIGH watchlist => CRITICAL high_risk_signal.
  const hr = alerts.find((a) => a.alertType === 'high_risk_signal');
  assert.ok(hr);
  assert.equal(hr!.severity, 'CRITICAL');
});

test('generateAlerts: source major change => MEDIUM', () => {
  const change: ChangeResult = {
    changed: true,
    changeType: 'major',
    similarity: 0.3,
    summary: 'big change',
  };
  const alerts = generateAlerts({ change, now: NOW });
  const sc = alerts.find((a) => a.alertType === 'source_changed');
  assert.ok(sc);
  assert.equal(sc!.severity, 'MEDIUM');
});

test('generateAlerts: EVERY alert carries an explanation', () => {
  const matches: WatchlistMatch[] = [
    { watchlistName: 'Doom', matchedTerms: ['doomer'], score: 0.2, severity: 'LOW' },
  ];
  const alerts = generateAlerts({ signal, watchlistMatches: matches, now: NOW });
  assert.ok(alerts.length > 0);
  for (const a of alerts) {
    assert.ok(a.explanation && a.explanation.length > 0, `${a.alertType} missing explanation`);
    assert.equal(a.createdAt, NOW);
  }
});
