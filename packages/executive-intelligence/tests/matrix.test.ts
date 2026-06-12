import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  attentionForScore,
  computePriorityScore,
  rankPriority,
  clamp01,
  round,
} from '../src/priority';
import { buildUnifiedSystemState, summarizeSystemState } from '../src/unified';
import { computeOperationalRisk, computeStrategicOpportunity, computeExecutiveAttention } from '../src/analysis';
import { buildExecutiveBrief } from '../src/briefing';
import { buildExecutiveSnapshot } from '../src/snapshot';
import type { BriefKind, PriorityInput, UnifiedInputs } from '../src/types';

const NOW = '2026-06-09T12:00:00.000Z';

// ---- clamp01 / round matrix -------------------------------------------------
for (const [input, expected] of [[-1, 0], [0, 0], [0.5, 0.5], [1, 1], [2, 1], [NaN, 0]] as Array<[number, number]>) {
  test(`clamp01(${input}) = ${expected}`, () => {
    assert.equal(clamp01(input), expected);
  });
}

for (const [input, expected] of [[0.123456, 0.12], [0.1, 0.1], [1, 1], [0, 0], [0.126, 0.13]] as Array<[number, number]>) {
  test(`round(${input}) = ${expected}`, () => {
    assert.equal(round(input), expected);
  });
}

// ---- attentionForScore boundaries -------------------------------------------
for (const [score, level] of [[0, 'routine'], [39, 'routine'], [40, 'notable'], [54, 'notable'], [55, 'elevated'], [74, 'elevated'], [75, 'urgent'], [100, 'urgent']] as Array<[number, string]>) {
  test(`attentionForScore(${score}) = ${level}`, () => {
    assert.equal(attentionForScore(score), level);
  });
}

// ---- priority score monotonicity over each factor ---------------------------
function base(o: Partial<PriorityInput> = {}): PriorityInput {
  return { id: 'p', kind: 'risk', title: 't', urgency: 0.5, impact: 0.5, confidence: 0.5, evidenceStrength: 0.5, ...o };
}
for (const factor of ['urgency', 'impact', 'confidence', 'evidenceStrength'] as const) {
  test(`score increases with ${factor}`, () => {
    const lo = computePriorityScore(base({ [factor]: 0.1 } as Partial<PriorityInput>));
    const hi = computePriorityScore(base({ [factor]: 0.9 } as Partial<PriorityInput>));
    assert.ok(hi >= lo, `${factor}: ${hi} >= ${lo}`);
  });
}

// ---- ranking stability: identical scores break ties by id -------------------
test('ties break deterministically by id', () => {
  const ranked = rankPriority([base({ id: 'zzz' }), base({ id: 'aaa' }), base({ id: 'mmm' })]);
  assert.equal(ranked.length, 3);
  // all equal score; ranks assigned 1..3 stable.
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

// ---- risk severity matrix ---------------------------------------------------
for (const [level, expectSeverity] of [['CRITICAL', 'CRITICAL'], ['WARNING', 'HIGH']] as Array<['CRITICAL' | 'WARNING', string]>) {
  test(`${level} warning → ${expectSeverity} risk`, () => {
    const s = buildUnifiedSystemState({ warnings: [{ id: 'w', kind: 'k', level, title: 't' }] }, { now: NOW });
    const risks = computeOperationalRisk(s);
    assert.equal(risks[0].severity, expectSeverity);
  });
}

// ---- opportunity priority value matrix --------------------------------------
for (const [priority, minScore] of [['CRITICAL', 60], ['HIGH', 40], ['NORMAL', 20], ['LOW', 0]] as Array<['CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW', number]>) {
  test(`${priority} opportunity scores >= ${minScore} at full confidence`, () => {
    const s = buildUnifiedSystemState({ opportunities: [{ id: 'o', title: 't', confidence: 1, priority }] }, { now: NOW });
    const opps = computeStrategicOpportunity(s);
    assert.ok(opps[0].score >= minScore);
  });
}

// ---- trust risk threshold matrix --------------------------------------------
for (const [score, isRisk] of [[20, true], [35, true], [45, false], [80, false]] as Array<[number, boolean]>) {
  test(`trust score ${score} risk=${isRisk}`, () => {
    const s = buildUnifiedSystemState({ trust: [{ entityType: 'source', entityId: 'x', score, band: score < 40 ? 'low' : 'medium' }] }, { now: NOW });
    const risks = computeOperationalRisk(s).filter((r) => r.source === 'trust');
    assert.equal(risks.length > 0, isRisk);
  });
}

// ---- health → attention pressure matrix -------------------------------------
for (const [health, minIndex] of [['HEALTHY', 0], ['DEGRADED', 8], ['DOWN', 20]] as Array<['HEALTHY' | 'DEGRADED' | 'DOWN', number]>) {
  test(`health ${health} contributes >= ${minIndex} attention`, () => {
    const s = buildUnifiedSystemState({ operations: { overallHealth: health } }, { now: NOW });
    assert.ok(computeExecutiveAttention(s).index >= minIndex);
  });
}

// ---- every brief kind is well-formed over a rich + empty state --------------
const RICH: UnifiedInputs = {
  warnings: [{ id: 'w', kind: 'trust_collapse', level: 'CRITICAL', title: 'x' }],
  forecasts: [{ id: 'f', prediction: 'p', confidence: 0.8, reliability: 0.7, status: 'active' }],
  governanceQueue: [{ id: 'g', source: 'consensus', label: 'l', severity: 'HIGH' }],
  scenarios: [{ id: 's', title: 't', state: 'ACTIVE', likelihood: 0.6 }],
  operations: { overallHealth: 'DEGRADED', activeRuns: 3, queueDepth: 2, openEscalations: 1 },
};
for (const kind of ['daily', 'weekly', 'critical', 'governance', 'forecast', 'operations'] as BriefKind[]) {
  for (const [label, inputs] of [['rich', RICH], ['empty', {}]] as Array<[string, UnifiedInputs]>) {
    test(`${kind} brief well-formed (${label})`, () => {
      const s = buildUnifiedSystemState(inputs, { now: NOW });
      const b = buildExecutiveBrief(kind, s, { now: NOW });
      assert.equal(b.kind, kind);
      assert.ok(b.title.length > 0 && b.headline.length > 0);
      assert.ok(b.sections.length > 0 && b.limitations.length > 0);
      for (const sec of b.sections) assert.ok(sec.items.length > 0);
    });
  }
}

// ---- snapshot invariants over scaled input sizes ----------------------------
for (const n of [0, 1, 5, 20]) {
  test(`snapshot stays valid with ${n} warnings`, () => {
    const warnings = Array.from({ length: n }, (_, i) => ({ id: `w${i}`, kind: 'k', level: 'WARNING' as const, title: `t${i}` }));
    const s = buildUnifiedSystemState({ warnings }, { now: NOW });
    const snap = buildExecutiveSnapshot(s, { now: NOW });
    assert.equal(snap.warnings.total, n);
    assert.ok(snap.attention.index >= 0 && snap.attention.index <= 100);
    assert.equal(snap.strategicPriorities.length, n); // one priority per warning
    for (let i = 0; i < snap.strategicPriorities.length; i++) assert.equal(snap.strategicPriorities[i].rank, i + 1);
  });
}

// ---- summarize invariants ---------------------------------------------------
for (const n of [0, 3, 10]) {
  test(`summarize counts ${n} governance items`, () => {
    const governanceQueue = Array.from({ length: n }, (_, i) => ({ id: `g${i}`, source: 'consensus' as const, label: 'l', severity: 'MEDIUM' as const }));
    const s = buildUnifiedSystemState({ governanceQueue }, { now: NOW });
    assert.equal(summarizeSystemState(s).governancePending, n);
  });
}
