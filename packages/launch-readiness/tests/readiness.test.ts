import { test } from 'node:test';
import assert from 'node:assert/strict';

import { workerHealth, queueHealth, worstStatus } from '../src/health';
import { integrityReport, computeKpis } from '../src/integrity';
import { buildReadinessReport, evaluateChecklist, auditConfig, RELEASE_CHECKLIST, CONFIG_REQUIREMENTS } from '../src/audit';
import { toCsv, toJson, exportAudit } from '../src/export';
import { demoWorkers, demoIntegrity, demoKpis, demoReadinessChecks, DEMO_NOW_MS } from '../src/fixtures';

// ---- health ----------------------------------------------------------------
test('worker health: healthy / degraded / down by age + failures', () => {
  assert.equal(workerHealth(demoWorkers[0], DEMO_NOW_MS).status, 'healthy');
  assert.equal(workerHealth(demoWorkers[2], DEMO_NOW_MS).status, 'down'); // ran 7h ago, interval 1h
  assert.equal(workerHealth({ name: 'x', lastRunAt: null, expectedIntervalMs: 1000, recentFailures: 0 }, DEMO_NOW_MS).status, 'down');
  assert.equal(workerHealth({ name: 'x', lastRunAt: '2026-06-14T11:00:00.000Z', expectedIntervalMs: 3_600_000, recentFailures: 2 }, DEMO_NOW_MS).status, 'degraded');
});

test('queue health by failure rate + backlog', () => {
  assert.equal(queueHealth({ pending: 5, running: 1, failed: 0, completed: 100 }).status, 'healthy');
  assert.equal(queueHealth({ pending: 0, running: 0, failed: 10, completed: 100 }).status, 'degraded'); // ~9%
  assert.equal(queueHealth({ pending: 0, running: 0, failed: 40, completed: 60 }).status, 'down'); // 40%
});

test('worstStatus rolls up', () => {
  assert.equal(worstStatus(['healthy', 'degraded', 'healthy']), 'degraded');
  assert.equal(worstStatus(['healthy', 'down']), 'down');
  assert.equal(worstStatus(['healthy', 'healthy']), 'healthy');
});

// ---- integrity + KPIs ------------------------------------------------------
test('integrity: orphans warn, broken/invalid are critical', () => {
  const clean = integrityReport(demoIntegrity);
  assert.equal(clean.clean, true); // only orphans (warning)
  const dirty = integrityReport({ orphans: 0, brokenLineage: 3, invalidAttribution: 0, invalidTrustLinks: 1 });
  assert.equal(dirty.clean, false);
  assert.equal(dirty.totalIssues, 4);
});

test('KPIs compute rates + throughput', () => {
  const k = computeKpis(demoKpis);
  assert.equal(k.acceptanceRate, Math.round((310 / 420) * 100));
  assert.equal(k.reviewAccuracy, Math.round((180 / 210) * 100));
  assert.ok(k.publicationThroughputPerWeek > 0);
  assert.equal(computeKpis({ ...demoKpis, signalsSubmitted: 0 }).acceptanceRate, 0);
});

// ---- readiness + checklist + config ---------------------------------------
test('readiness report: all-pass → ready, score 100', () => {
  const r = buildReadinessReport(demoReadinessChecks);
  assert.equal(r.ready, true);
  assert.equal(r.score, 100);
  const withFail = buildReadinessReport([...demoReadinessChecks, { key: 'x', label: 'x', category: 'monitoring', passed: false }]);
  assert.equal(withFail.ready, false);
  assert.ok(withFail.score < 100);
});

test('release checklist evaluates done flags', () => {
  assert.ok(RELEASE_CHECKLIST.length >= 10);
  const res = evaluateChecklist({ typecheck: true, build: true });
  assert.equal(res.find((i) => i.key === 'typecheck')?.done, true);
  assert.equal(res.find((i) => i.key === 'docs')?.done, false);
});

test('config audit flags missing required keys', () => {
  assert.ok(CONFIG_REQUIREMENTS.some((c) => c.required));
  const ok = auditConfig({ NEXT_PUBLIC_SUPABASE_URL: true, NEXT_PUBLIC_SUPABASE_ANON_KEY: true, SUPABASE_SERVICE_ROLE_KEY: true, NEXT_PUBLIC_APP_URL: true });
  assert.equal(ok.ready, true);
  const bad = auditConfig({ NEXT_PUBLIC_SUPABASE_URL: true });
  assert.equal(bad.ready, false);
  assert.ok(bad.missingRequired.includes('SUPABASE_SERVICE_ROLE_KEY'));
});

// ---- export (with CSV injection neutralisation) ----------------------------
test('toCsv escapes commas/quotes/newlines + neutralises formulas', () => {
  const csv = toCsv([{ a: 'hi, there', b: '=SUM(A1)', c: 'line\nbreak' }]);
  assert.ok(csv.includes('"hi, there"'));
  assert.ok(csv.includes("'=SUM(A1)") || csv.includes('"\'=SUM(A1)"'));
  assert.ok(csv.includes('"line\nbreak"'));
});

test('toJson round-trips + exportAudit dispatches', () => {
  const rows = [{ id: 1, name: 'a' }];
  assert.deepEqual(JSON.parse(toJson(rows)), rows);
  assert.equal(exportAudit([], 'csv'), '');
  assert.ok(exportAudit(rows, 'json').includes('"name"'));
});
