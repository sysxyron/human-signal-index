import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canCurate,
  canResearch,
  confidenceBand,
  demoForecastDetail,
  demoForecastingHighlights,
  demoForecastsBoard,
  demoScenarioDetail,
  demoScenariosBoard,
  demoWarningsBoard,
  forecastStatusDecor,
  formatBrier,
  formatPct,
  readAccuracyBins,
  readStringArray,
  readTree,
  scenarioStateDecor,
  warningLevelDecor,
} from './view';

// ---- role gating ------------------------------------------------------------
test('role gates', () => {
  assert.equal(canResearch('researcher'), true);
  assert.equal(canResearch('viewer'), false);
  assert.equal(canCurate('curator'), true);
  assert.equal(canCurate('researcher'), false);
});

// ---- decorators -------------------------------------------------------------
test('forecastStatusDecor', () => {
  assert.equal(forecastStatusDecor('active').tone, 'blue');
  assert.equal(forecastStatusDecor('failed').tone, 'red');
  assert.equal(forecastStatusDecor('confirmed').tone, 'green');
  assert.equal(forecastStatusDecor(null).label, 'Unknown');
});

test('scenarioStateDecor', () => {
  assert.equal(scenarioStateDecor('EMERGING').tone, 'cyan');
  assert.equal(scenarioStateDecor('INVALIDATED').tone, 'red');
  assert.equal(scenarioStateDecor('CONFIRMED').tone, 'green');
});

test('warningLevelDecor', () => {
  assert.equal(warningLevelDecor('CRITICAL').tone, 'red');
  assert.equal(warningLevelDecor('WARNING').tone, 'orange');
  assert.equal(warningLevelDecor('WATCH').tone, 'cyan');
  assert.equal(warningLevelDecor('INFO').tone, 'blue');
});

test('confidenceBand thresholds', () => {
  assert.equal(confidenceBand(0.8).tone, 'green');
  assert.equal(confidenceBand(0.55).tone, 'orange');
  assert.equal(confidenceBand(0.3).tone, 'red');
  assert.equal(confidenceBand(null).label, 'Unknown');
});

// ---- formatters -------------------------------------------------------------
test('formatPct', () => {
  assert.equal(formatPct(0.74), '74%');
  assert.equal(formatPct(null), '—');
  assert.equal(formatPct(2), '100%');
});

test('formatBrier', () => {
  assert.equal(formatBrier(0.083), '0.083');
  assert.equal(formatBrier(null), '—');
});

test('readStringArray', () => {
  assert.deepEqual(readStringArray({ items: ['a'] }), ['a']);
  assert.deepEqual(readStringArray(['b']), ['b']);
  assert.deepEqual(readStringArray(null), []);
});

test('readTree parses a tree', () => {
  const node = readTree({ id: 'r', label: 'Root', probability: 1, children: [{ id: 'a', label: 'A', probability: 0.5, children: [] }] });
  assert.ok(node);
  assert.equal(node?.children.length, 1);
  assert.equal(node?.children[0].label, 'A');
});

test('readTree handles non-record', () => {
  assert.equal(readTree(null), null);
});

// ---- demo builders ----------------------------------------------------------
test('demoForecastsBoard has a forecast + accuracy', () => {
  const d = demoForecastsBoard();
  assert.equal(d.rows.length, 1);
  assert.ok(d.accuracy);
  assert.ok(d.rows[0].confidence > 0.5);
});

test('demoForecastDetail has explanation with factors + assumptions', () => {
  const d = demoForecastDetail();
  assert.ok(d.explanation.factors.length > 0);
  assert.ok(d.explanation.assumptions.length > 0);
  assert.ok(d.explanation.invalidationCriteria.length > 0);
  assert.ok(d.explanation.limitations.length > 0);
  assert.ok(d.explanation.summary.includes('hypothesis'));
});

test('demoScenariosBoard has scenarios + comparison', () => {
  const d = demoScenariosBoard();
  assert.equal(d.scenarios.length, 3);
  assert.ok(d.comparison);
});

test('demoScenarioDetail has a tree + ranking', () => {
  const d = demoScenarioDetail();
  assert.ok(d.tree);
  assert.ok(d.ranked.length >= 1);
});

test('demoWarningsBoard has warnings + level breakdown', () => {
  const d = demoWarningsBoard();
  assert.ok(d.warnings.length >= 5);
  const total = Object.values(d.byLevel).reduce((a, n) => a + n, 0);
  assert.equal(total, d.warnings.length);
});

test('demoForecastingHighlights shape', () => {
  const h = demoForecastingHighlights();
  assert.ok((h.activeForecasts ?? 0) >= 0);
  assert.ok((h.warningAlerts ?? 0) >= 0);
});

test('readAccuracyBins from demo accuracy', () => {
  const d = demoForecastsBoard();
  const bins = readAccuracyBins(d.accuracy);
  assert.ok(bins.length >= 1);
});

test('demo builders deterministic', () => {
  assert.deepEqual(demoForecastsBoard(), demoForecastsBoard());
  assert.deepEqual(demoScenariosBoard(), demoScenariosBoard());
  assert.deepEqual(demoWarningsBoard(), demoWarningsBoard());
});

test('all demo warnings carry advisory recommendations', () => {
  const d = demoWarningsBoard();
  assert.ok(d.warnings.every((w) => (w.recommendation ?? '').length > 0));
});

test('demo scenario detail tree has children', () => {
  const d = demoScenarioDetail();
  const node = readTree(d.tree?.tree);
  assert.ok(node && node.children.length >= 1);
});
