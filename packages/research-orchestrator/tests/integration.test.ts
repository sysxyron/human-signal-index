import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceResearchRun,
  agentForStage,
  assignAgents,
  createResearchRun,
  escalateBlockedTasks,
  escalateResearchIssue,
  getWorkflowTemplate,
  PIPELINE,
  pipelineProgress,
  retryFailedTasks,
  transitionResearchRun,
  updateTaskState,
} from '../src';
import {
  dequeueResearch,
  enqueueResearch,
  failResearch,
  completeResearch,
  type QueueItem,
} from '@hsi/intelligence-queue';
import { FIXTURE_NOW } from '../src/fixtures';
import type { AgentTask, ResearchRun } from '../src/types';

const NOW = FIXTURE_NOW;

// A run flows: enqueue → dequeue → advance through pipeline → agents assigned →
// tasks complete → queue completes. This exercises the full coordination surface.

test('end-to-end: a queued run advances and assigns agents at each working stage', () => {
  let run = createResearchRun({ id: 'r1', priority: 'HIGH', workflow: 'historical-investigation' }, { now: NOW });
  let tasks: AgentTask[] = [];
  const stagesWithAgents: string[] = [];

  for (let i = 0; i < PIPELINE.length + 2; i++) {
    const res = advanceResearchRun(run, { now: NOW });
    if (!res.ok) break;
    run = res.run;
    const agent = agentForStage(run.state);
    if (agent) {
      const out = assignAgents(run, run.state, tasks, { now: NOW });
      tasks = out.tasks;
      stagesWithAgents.push(run.state);
    }
    if (run.state === 'COMPLETE') break;
  }

  assert.equal(run.state, 'COMPLETE');
  assert.ok(stagesWithAgents.includes('EVIDENCING'));
  assert.ok(stagesWithAgents.includes('TRUST'));
  // Every assigned task is unique per run-stage.
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length);
});

test('end-to-end: queue drives the run', () => {
  let queue: QueueItem[] = [];
  const enq = enqueueResearch(queue, { id: 'q1', runId: 'r1', priority: 'CRITICAL' }, { now: NOW });
  assert.ok(enq.ok);
  if (enq.ok) queue = enq.data.queue;

  const deq = dequeueResearch(queue, { now: NOW });
  assert.ok(deq.ok);
  if (deq.ok) {
    assert.equal(deq.data.item?.runId, 'r1');
    queue = deq.data.queue;
  }
  const done = completeResearch(queue, 'q1', { now: NOW });
  assert.ok(done.ok);
  if (done.ok) assert.equal(done.data.queue[0].status, 'completed');
});

test('end-to-end: a failing agent task is retried then escalated', () => {
  let run = createResearchRun({ id: 'r1', priority: 'NORMAL' }, { now: NOW });
  // advance to EVIDENCING.
  for (const s of ['QUEUED', 'DISCOVERING', 'COLLECTING', 'ANALYZING', 'REASONING', 'EVIDENCING'] as const) {
    const res = transitionResearchRun(run, s, { now: NOW });
    if (res.ok) run = res.run;
  }
  let { tasks } = assignAgents(run, 'EVIDENCING', [], { now: NOW });
  // fail it twice (within budget) then exhaust.
  tasks = updateTaskState(tasks, tasks[0].id, 'active', { now: NOW });
  tasks = updateTaskState(tasks, tasks[0].id, 'failed', { now: NOW, error: 'x' });
  let retry = retryFailedTasks(tasks, { now: NOW });
  assert.equal(retry.retried, 1);
  tasks = retry.tasks;
  // exhaust attempts.
  tasks = tasks.map((t) => ({ ...t, state: 'failed', attempts: t.maxAttempts }));
  const toEscalate = escalateBlockedTasks(tasks);
  assert.equal(toEscalate.length, 1);
  const esc = escalateResearchIssue({ id: 'e1', trigger: 'repeated_failures', runId: run.id }, { now: NOW });
  assert.equal(esc.severity, 'HIGH');
  assert.equal(esc.runId, 'r1');
});

test('end-to-end: a failed run can be retried back to QUEUED then re-run', () => {
  let run: ResearchRun = createResearchRun({ id: 'r1', priority: 'NORMAL' }, { now: NOW });
  const toAnalyzing = ['QUEUED', 'DISCOVERING', 'COLLECTING', 'ANALYZING'] as const;
  for (const s of toAnalyzing) {
    const res = transitionResearchRun(run, s, { now: NOW });
    if (res.ok) run = res.run;
  }
  const failed = transitionResearchRun(run, 'FAILED', { now: NOW, reason: 'agent crash' });
  assert.ok(failed.ok);
  if (failed.ok) run = failed.run;
  const requeued = transitionResearchRun(run, 'QUEUED', { now: NOW, reason: 'retry' });
  assert.ok(requeued.ok);
  if (requeued.ok) {
    assert.equal(requeued.run.state, 'QUEUED');
    // history preserved across the failure + retry.
    assert.ok(requeued.run.events.length >= 6);
  }
});

test('end-to-end: an escalated run can route to governance', () => {
  let run = createResearchRun({ id: 'r1', priority: 'HIGH' }, { now: NOW });
  const r1 = transitionResearchRun(run, 'QUEUED', { now: NOW });
  if (r1.ok) run = r1.run;
  const r2 = transitionResearchRun(run, 'ESCALATED', { now: NOW, reason: 'trust collapse' });
  assert.ok(r2.ok);
  if (r2.ok) run = r2.run;
  const r3 = transitionResearchRun(run, 'GOVERNANCE', { now: NOW, reason: 'human review' });
  assert.ok(r3.ok);
  if (r3.ok) assert.equal(r3.run.state, 'GOVERNANCE');
});

test('workflow template stages are a subset of the pipeline', () => {
  const t = getWorkflowTemplate('historical-investigation')!;
  for (const stage of t.stages) {
    assert.ok(PIPELINE.includes(stage), `${stage} not in pipeline`);
  }
});

test('progress increases as the run advances', () => {
  let run = createResearchRun({ id: 'r1', priority: 'NORMAL' }, { now: NOW });
  let last = pipelineProgress(run.state);
  for (let i = 0; i < 6; i++) {
    const res = advanceResearchRun(run, { now: NOW });
    if (!res.ok) break;
    run = res.run;
    const p = pipelineProgress(run.state);
    assert.ok(p >= last);
    last = p;
  }
});

test('queue retry backoff makes an item temporarily unavailable then ready', () => {
  let queue: QueueItem[] = [];
  const enq = enqueueResearch(queue, { id: 'q1', runId: 'r1' }, { now: NOW });
  if (enq.ok) queue = enq.data.queue;
  const deq = dequeueResearch(queue, { now: NOW });
  if (deq.ok) queue = deq.data.queue;
  const f = failResearch(queue, 'q1', 'boom', { now: NOW });
  assert.ok(f.ok);
  if (f.ok) {
    queue = f.data.queue;
    // not ready immediately after backoff
    const immediate = dequeueResearch(queue, { now: NOW });
    assert.ok(immediate.ok);
    if (immediate.ok) assert.equal(immediate.data.item, null);
    // ready after the backoff window
    const later = '2026-06-09T13:00:00.000Z';
    const ready = dequeueResearch(queue, { now: later });
    assert.ok(ready.ok);
    if (ready.ok) assert.equal(ready.data.item?.id, 'q1');
  }
});

test('deterministic end-to-end run', () => {
  const build = () => {
    let run = createResearchRun({ id: 'r1', priority: 'NORMAL' }, { now: NOW });
    for (let i = 0; i < 20; i++) {
      const res = advanceResearchRun(run, { now: NOW });
      if (!res.ok) break;
      run = res.run;
    }
    return run;
  };
  assert.deepEqual(build(), build());
});
