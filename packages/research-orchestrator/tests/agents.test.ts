import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_TYPES,
  agentForStage,
  agentHealth,
  assignAgents,
  escalateBlockedTasks,
  rebalanceWork,
  retryFailedTasks,
  updateTaskState,
} from '../src/agents';
import { FIXTURE_NOW } from '../src/fixtures';
import type { AgentTask } from '../src/types';

const NOW = FIXTURE_NOW;

test('eight agent types', () => {
  assert.equal(AGENT_TYPES.length, 8);
  assert.ok(AGENT_TYPES.includes('trust'));
});

test('agentForStage maps stages', () => {
  assert.equal(agentForStage('EVIDENCING'), 'evidence');
  assert.equal(agentForStage('TEMPORAL'), 'temporal');
  assert.equal(agentForStage('CAUSAL'), 'causal');
  assert.equal(agentForStage('COUNTERFACTUAL'), 'counterfactual');
  assert.equal(agentForStage('DECISION'), 'decision');
  assert.equal(agentForStage('OUTCOME'), 'outcome');
  assert.equal(agentForStage('TRUST'), 'trust');
  assert.equal(agentForStage('DISCOVERING'), 'research');
});

test('GOVERNANCE has no agent (human)', () => {
  assert.equal(agentForStage('GOVERNANCE'), undefined);
});

test('assignAgents creates a task for an agent stage', () => {
  const { tasks, assignments } = assignAgents({ id: 'r1' }, 'EVIDENCING', [], { now: NOW });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].agentType, 'evidence');
  assert.equal(tasks[0].state, 'pending');
  assert.equal(assignments.length, 1);
});

test('assignAgents is idempotent per run-stage', () => {
  const first = assignAgents({ id: 'r1' }, 'EVIDENCING', [], { now: NOW });
  const second = assignAgents({ id: 'r1' }, 'EVIDENCING', first.tasks, { now: NOW });
  assert.equal(second.tasks.length, 1);
  assert.equal(second.assignments.length, 0);
});

test('assignAgents no-ops for a human stage', () => {
  const { tasks, assignments } = assignAgents({ id: 'r1' }, 'GOVERNANCE', [], { now: NOW });
  assert.equal(tasks.length, 0);
  assert.equal(assignments.length, 0);
});

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    runId: 'r1',
    agentType: 'research',
    stage: 'ANALYZING',
    state: 'pending',
    attempts: 0,
    maxAttempts: 3,
    runtimeMs: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test('rebalanceWork moves blocked back to pending', () => {
  const { tasks, rebalanced } = rebalanceWork([task({ state: 'blocked' })], { now: NOW });
  assert.equal(rebalanced, 1);
  assert.equal(tasks[0].state, 'pending');
});

test('rebalanceWork leaves non-blocked alone', () => {
  const { rebalanced } = rebalanceWork([task({ state: 'active' })], { now: NOW });
  assert.equal(rebalanced, 0);
});

test('retryFailedTasks resets retryable failures', () => {
  const { tasks, retried } = retryFailedTasks([task({ state: 'failed', attempts: 1 })], { now: NOW });
  assert.equal(retried, 1);
  assert.equal(tasks[0].state, 'pending');
});

test('retryFailedTasks leaves exhausted failures', () => {
  const { tasks, retried } = retryFailedTasks([task({ state: 'failed', attempts: 3, maxAttempts: 3 })], { now: NOW });
  assert.equal(retried, 0);
  assert.equal(tasks[0].state, 'failed');
});

test('escalateBlockedTasks flags blocked + exhausted failed', () => {
  const flagged = escalateBlockedTasks([
    task({ id: 'a', state: 'blocked' }),
    task({ id: 'b', state: 'failed', attempts: 3, maxAttempts: 3 }),
    task({ id: 'c', state: 'failed', attempts: 1, maxAttempts: 3 }),
    task({ id: 'd', state: 'completed' }),
  ]);
  assert.deepEqual(flagged.map((t) => t.id).sort(), ['a', 'b']);
});

test('updateTaskState accrues runtime and attempts on active', () => {
  const tasks = updateTaskState([task()], 't1', 'active', { now: NOW, addRuntimeMs: 500 });
  assert.equal(tasks[0].state, 'active');
  assert.equal(tasks[0].attempts, 1);
  assert.equal(tasks[0].runtimeMs, 500);
});

test('updateTaskState records error on failure', () => {
  const tasks = updateTaskState([task()], 't1', 'failed', { now: NOW, error: 'boom' });
  assert.equal(tasks[0].lastError, 'boom');
});

test('agentHealth returns all eight agents', () => {
  const health = agentHealth([]);
  assert.equal(health.length, 8);
  assert.ok(health.every((h) => h.status === 'HEALTHY'));
});

test('agentHealth marks DOWN on blocked task', () => {
  const health = agentHealth([task({ agentType: 'evidence', state: 'blocked' })]);
  const ev = health.find((h) => h.agentType === 'evidence');
  assert.equal(ev?.status, 'DOWN');
});

test('agentHealth marks DEGRADED on a failure', () => {
  const health = agentHealth([
    task({ id: 'a', agentType: 'causal', state: 'completed' }),
    task({ id: 'b', agentType: 'causal', state: 'failed' }),
  ]);
  const ca = health.find((h) => h.agentType === 'causal');
  assert.ok(ca?.status === 'DEGRADED' || ca?.status === 'DOWN');
});

test('agentHealth computes success rate', () => {
  const health = agentHealth([
    task({ id: 'a', agentType: 'research', state: 'completed' }),
    task({ id: 'b', agentType: 'research', state: 'completed' }),
    task({ id: 'c', agentType: 'research', state: 'failed' }),
  ]);
  const re = health.find((h) => h.agentType === 'research');
  assert.ok(Math.abs((re?.successRate ?? 0) - 0.67) < 0.02);
});

test('inputs not mutated by coordination ops', () => {
  const t = [task({ state: 'blocked' })];
  const snap = t[0].state;
  rebalanceWork(t, { now: NOW });
  retryFailedTasks(t, { now: NOW });
  assert.equal(t[0].state, snap);
});

test('deterministic agentHealth', () => {
  const tasks = [task({ agentType: 'trust', state: 'completed' })];
  assert.deepEqual(agentHealth(tasks), agentHealth(tasks));
});
