import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PIPELINE,
  TRANSITIONS,
  advanceResearchRun,
  createResearchRun,
  isTerminal,
  nextPipelineState,
  pipelineProgress,
  transitionResearchRun,
  validateResearchTransition,
} from '../src/states';
import { FIXTURE_NOW } from '../src/fixtures';
import type { ResearchRun } from '../src/types';

const NOW = FIXTURE_NOW;

function run(state: ResearchRun['state'] = 'CREATED'): ResearchRun {
  const r = createResearchRun({ id: 'r1', priority: 'NORMAL' }, { now: NOW });
  return { ...r, state };
}

test('pipeline has 16 states ending COMPLETE', () => {
  assert.equal(PIPELINE.length, 16);
  assert.equal(PIPELINE[0], 'CREATED');
  assert.equal(PIPELINE[PIPELINE.length - 1], 'COMPLETE');
});

test('createResearchRun starts in CREATED with a genesis event', () => {
  const r = createResearchRun({ id: 'r1', priority: 'HIGH' }, { now: NOW });
  assert.equal(r.state, 'CREATED');
  assert.equal(r.events.length, 1);
  assert.equal(r.priority, 'HIGH');
});

test('validate allows the next pipeline step', () => {
  assert.equal(validateResearchTransition('CREATED', 'QUEUED').valid, true);
  assert.equal(validateResearchTransition('QUEUED', 'DISCOVERING').valid, true);
  assert.equal(validateResearchTransition('GOVERNANCE', 'COMPLETE').valid, true);
});

test('validate rejects skipping a step', () => {
  assert.equal(validateResearchTransition('CREATED', 'DECISION').valid, false);
});

test('validate rejects self-transition', () => {
  assert.equal(validateResearchTransition('ANALYZING', 'ANALYZING').valid, false);
});

test('working states may fail or escalate', () => {
  assert.equal(validateResearchTransition('ANALYZING', 'FAILED').valid, true);
  assert.equal(validateResearchTransition('ANALYZING', 'ESCALATED').valid, true);
});

test('COMPLETE is terminal with no transitions', () => {
  assert.deepEqual(TRANSITIONS.COMPLETE, []);
  assert.equal(isTerminal('COMPLETE'), true);
});

test('FAILED may retry to QUEUED or escalate', () => {
  assert.equal(validateResearchTransition('FAILED', 'QUEUED').valid, true);
  assert.equal(validateResearchTransition('FAILED', 'ESCALATED').valid, true);
});

test('ESCALATED may resume, govern, or fail', () => {
  assert.equal(validateResearchTransition('ESCALATED', 'QUEUED').valid, true);
  assert.equal(validateResearchTransition('ESCALATED', 'GOVERNANCE').valid, true);
  assert.equal(validateResearchTransition('ESCALATED', 'FAILED').valid, true);
});

test('transition appends an audited event', () => {
  const res = transitionResearchRun(run('CREATED'), 'QUEUED', { now: NOW, actor: 'alice', reason: 'go' });
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.run.state, 'QUEUED');
    assert.equal(res.event.from, 'CREATED');
    assert.equal(res.event.to, 'QUEUED');
    assert.equal(res.event.actor, 'alice');
    assert.equal(res.run.events.length, 2);
  }
});

test('invalid transition returns ok:false with a reason, never throws', () => {
  const res = transitionResearchRun(run('CREATED'), 'TRUST', { now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error, 'INVALID_TRANSITION');
    assert.match(res.reason, /not permitted/);
  }
});

test('transition does not mutate the input run', () => {
  const r = run('CREATED');
  transitionResearchRun(r, 'QUEUED', { now: NOW });
  assert.equal(r.state, 'CREATED');
  assert.equal(r.events.length, 1);
});

test('nextPipelineState walks forward', () => {
  assert.equal(nextPipelineState('CREATED'), 'QUEUED');
  assert.equal(nextPipelineState('TRUST'), 'GOVERNANCE');
  assert.equal(nextPipelineState('COMPLETE'), null);
  assert.equal(nextPipelineState('FAILED'), null);
});

test('advance moves to next pipeline state', () => {
  const res = advanceResearchRun(run('REASONING'), { now: NOW });
  assert.ok(res.ok);
  if (res.ok) assert.equal(res.run.state, 'EVIDENCING');
});

test('advance on COMPLETE returns ok:false', () => {
  const res = advanceResearchRun(run('COMPLETE'), { now: NOW });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, 'NO_NEXT_STATE');
});

test('advance on FAILED returns ok:false (use explicit transition)', () => {
  const res = advanceResearchRun(run('FAILED'), { now: NOW });
  assert.equal(res.ok, false);
});

test('full pipeline advance reaches COMPLETE', () => {
  let r = createResearchRun({ id: 'r', priority: 'NORMAL' }, { now: NOW });
  for (let i = 0; i < 20; i++) {
    const res = advanceResearchRun(r, { now: NOW });
    if (!res.ok) break;
    r = res.run;
  }
  assert.equal(r.state, 'COMPLETE');
});

test('pipelineProgress increases monotonically', () => {
  assert.equal(pipelineProgress('CREATED'), 0);
  assert.ok(pipelineProgress('DECISION') > pipelineProgress('EVIDENCING'));
  assert.equal(pipelineProgress('COMPLETE'), 1);
});

test('pipelineProgress is 0 for off-pipeline states', () => {
  assert.equal(pipelineProgress('FAILED'), 0);
  assert.equal(pipelineProgress('ESCALATED'), 0);
});

test('deterministic transitions', () => {
  assert.deepEqual(
    transitionResearchRun(run('CREATED'), 'QUEUED', { now: NOW }),
    transitionResearchRun(run('CREATED'), 'QUEUED', { now: NOW }),
  );
});

test('every pipeline state (except COMPLETE) has a defined transition list', () => {
  for (const s of PIPELINE) {
    assert.ok(Array.isArray(TRANSITIONS[s]), `missing transitions for ${s}`);
  }
});
