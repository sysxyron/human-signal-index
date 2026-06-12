import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExecutiveBrief,
  generateCriticalBrief,
  generateDailyBrief,
  generateForecastBrief,
  generateGovernanceBrief,
  generateOperationsBrief,
  generateWeeklyBrief,
} from '../src/briefing';
import { buildUnifiedSystemState } from '../src/unified';
import { DEMO_INPUTS, FIXTURE_NOW } from '../src/fixtures';
import type { BriefKind } from '../src/types';

const NOW = FIXTURE_NOW;
const STATE = buildUnifiedSystemState(DEMO_INPUTS, { now: NOW });

function assertWellFormed(b: { kind: string; title: string; headline: string; sections: { items: string[]; sources: string[] }[]; limitations: string[]; generatedAt: string }) {
  assert.ok(b.title.length > 0);
  assert.ok(b.headline.length > 0);
  assert.ok(b.sections.length > 0);
  assert.ok(b.limitations.length > 0);
  assert.ok(b.limitations.some((l) => /advisory/i.test(l)));
  assert.equal(b.generatedAt, NOW);
  for (const s of b.sections) assert.ok(s.items.length > 0);
}

test('daily brief well-formed', () => {
  const b = generateDailyBrief(STATE, { now: NOW });
  assert.equal(b.kind, 'daily');
  assertWellFormed(b);
  assert.ok(b.sections.some((s) => s.key === 'risks'));
  assert.ok(b.sections.some((s) => s.key === 'governance'));
});

test('weekly brief reframes daily', () => {
  const b = generateWeeklyBrief(STATE, { now: NOW });
  assert.equal(b.kind, 'weekly');
  assert.match(b.headline, /Week in review/);
  assertWellFormed(b);
});

test('critical brief only critical/high', () => {
  const b = generateCriticalBrief(STATE, { now: NOW });
  assert.equal(b.kind, 'critical');
  assert.match(b.headline, /critical\/high|require attention/i);
  assertWellFormed(b);
});

test('critical brief on clean state reports none', () => {
  const clean = buildUnifiedSystemState({ operations: { overallHealth: 'HEALTHY' } }, { now: NOW });
  const b = generateCriticalBrief(clean, { now: NOW });
  assert.match(b.headline, /No critical items/);
});

test('governance brief lists queue + by-source', () => {
  const b = generateGovernanceBrief(STATE, { now: NOW });
  assert.equal(b.kind, 'governance');
  assert.match(b.headline, /3 governance item/);
  assert.ok(b.sections.some((s) => s.key === 'by_source'));
  assertWellFormed(b);
});

test('forecast brief lists active + scenarios', () => {
  const b = generateForecastBrief(STATE, { now: NOW });
  assert.equal(b.kind, 'forecast');
  assert.ok(b.sections.some((s) => s.key === 'active'));
  assert.ok(b.sections.some((s) => s.key === 'scenarios'));
  assertWellFormed(b);
});

test('operations brief lists health + publishing + outcomes', () => {
  const b = generateOperationsBrief(STATE, { now: NOW });
  assert.equal(b.kind, 'operations');
  assert.match(b.headline, /Platform DEGRADED/);
  assert.ok(b.sections.some((s) => s.key === 'health'));
  assertWellFormed(b);
});

test('buildExecutiveBrief dispatches by kind', () => {
  const kinds: BriefKind[] = ['daily', 'weekly', 'critical', 'governance', 'forecast', 'operations'];
  for (const k of kinds) assert.equal(buildExecutiveBrief(k, STATE, { now: NOW }).kind, k);
});

test('every section carries source references where applicable', () => {
  const b = generateDailyBrief(STATE, { now: NOW });
  const risks = b.sections.find((s) => s.key === 'risks');
  assert.ok(risks && risks.sources.length > 0);
});

test('briefs are deterministic', () => {
  assert.deepEqual(generateDailyBrief(STATE, { now: NOW }), generateDailyBrief(STATE, { now: NOW }));
  assert.deepEqual(generateForecastBrief(STATE, { now: NOW }), generateForecastBrief(STATE, { now: NOW }));
});

test('empty state briefs still well-formed', () => {
  const empty = buildUnifiedSystemState({}, { now: NOW });
  for (const k of ['daily', 'weekly', 'critical', 'governance', 'forecast', 'operations'] as BriefKind[]) {
    const b = buildExecutiveBrief(k, empty, { now: NOW });
    assert.ok(b.sections.length > 0);
    assert.ok(b.limitations.length > 0);
  }
});
