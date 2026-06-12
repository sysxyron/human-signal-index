// =============================================================================
// @hsi/research-orchestrator — the AGENT COORDINATION engine.
//
// Maps each research-run stage to the specialised agent that serves it, then
// coordinates the agent tasks: assignAgents() (create the tasks a stage needs),
// rebalanceWork() (move blocked tasks back to pending), retryFailedTasks() (reset
// retryable failures), escalateBlockedTasks() (surface tasks stuck past their
// attempt budget). Tracks per-agent runtime / health / failures / completion.
//
// PURE + DETERMINISTIC. Inputs are never mutated.
// =============================================================================

import type {
  AgentAssignment,
  AgentHealth,
  AgentHealthStatus,
  AgentTask,
  AgentType,
  ResearchRunState,
} from './types';

/** Which agent serves each pipeline stage (stages with no agent → undefined). */
export const STAGE_AGENT: Partial<Record<ResearchRunState, AgentType>> = {
  DISCOVERING: 'research',
  COLLECTING: 'research',
  ANALYZING: 'research',
  REASONING: 'research',
  EVIDENCING: 'evidence',
  TEMPORAL: 'temporal',
  CAUSAL: 'causal',
  COUNTERFACTUAL: 'counterfactual',
  DECISION: 'decision',
  OUTCOME: 'outcome',
  CALIBRATION: 'trust',
  TRUST: 'trust',
};

/** The eight agents, in display order. */
export const AGENT_TYPES: AgentType[] = [
  'research',
  'evidence',
  'temporal',
  'causal',
  'counterfactual',
  'decision',
  'outcome',
  'trust',
];

export const DEFAULT_TASK_MAX_ATTEMPTS = 3;

/** The agent that should serve a given stage, if any. */
export function agentForStage(stage: ResearchRunState): AgentType | undefined {
  return STAGE_AGENT[stage];
}

/**
 * Assign the agent(s) a run needs for the given stage. Returns the new tasks +
 * their assignments. If the stage needs no agent (e.g. GOVERNANCE — human), the
 * result is empty. A task id is derived deterministically from run+stage so the
 * same call is idempotent (no duplicate task per run-stage). Inputs not mutated.
 */
export function assignAgents(
  run: { id: string },
  stage: ResearchRunState,
  existing: AgentTask[],
  opts: { now: string; maxAttempts?: number },
): { tasks: AgentTask[]; assignments: AgentAssignment[] } {
  const agentType = agentForStage(stage);
  if (!agentType) return { tasks: existing, assignments: [] };

  const taskId = `${run.id}:${stage}:${agentType}`;
  if (existing.some((t) => t.id === taskId)) {
    return { tasks: existing, assignments: [] };
  }
  const task: AgentTask = {
    id: taskId,
    runId: run.id,
    agentType,
    stage,
    state: 'pending',
    attempts: 0,
    maxAttempts: Math.max(1, opts.maxAttempts ?? DEFAULT_TASK_MAX_ATTEMPTS),
    runtimeMs: 0,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
  const assignment: AgentAssignment = {
    runId: run.id,
    stage,
    agentType,
    taskId,
    at: opts.now,
  };
  return { tasks: [...existing, task], assignments: [assignment] };
}

/**
 * Rebalance work: any task `blocked` is returned to `pending` so it can be picked
 * up again (deterministic, idempotent). Returns the rebalanced task list + the
 * count moved. Inputs not mutated.
 */
export function rebalanceWork(
  tasks: AgentTask[],
  opts: { now: string },
): { tasks: AgentTask[]; rebalanced: number } {
  let rebalanced = 0;
  const next = tasks.map((t) => {
    if (t.state === 'blocked') {
      rebalanced += 1;
      return { ...t, state: 'pending' as const, updatedAt: opts.now };
    }
    return t;
  });
  return { tasks: next, rebalanced };
}

/**
 * Reset retryable FAILED tasks (attempts < maxAttempts) back to `pending`. Tasks
 * past their budget are left FAILED (escalate them instead). Returns the new task
 * list + the count retried. Inputs not mutated.
 */
export function retryFailedTasks(
  tasks: AgentTask[],
  opts: { now: string },
): { tasks: AgentTask[]; retried: number } {
  let retried = 0;
  const next = tasks.map((t) => {
    if (t.state === 'failed' && t.attempts < t.maxAttempts) {
      retried += 1;
      return { ...t, state: 'pending' as const, updatedAt: opts.now };
    }
    return t;
  });
  return { tasks: next, retried };
}

/**
 * Identify tasks that should be escalated: FAILED past their attempt budget, or
 * BLOCKED. Returns the offending tasks (the caller raises an EscalationRecord via
 * the escalation engine). Does NOT mutate; does NOT auto-act.
 */
export function escalateBlockedTasks(tasks: AgentTask[]): AgentTask[] {
  return tasks.filter(
    (t) => t.state === 'blocked' || (t.state === 'failed' && t.attempts >= t.maxAttempts),
  );
}

/** Mark a task's outcome (active/completed/failed/blocked), accruing runtime. */
export function updateTaskState(
  tasks: AgentTask[],
  taskId: string,
  state: AgentTask['state'],
  opts: { now: string; addRuntimeMs?: number; error?: string },
): AgentTask[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t;
    const attempts = state === 'active' ? t.attempts + 1 : t.attempts;
    return {
      ...t,
      state,
      attempts,
      runtimeMs: t.runtimeMs + Math.max(0, opts.addRuntimeMs ?? 0),
      ...(opts.error ? { lastError: opts.error } : {}),
      updatedAt: opts.now,
    };
  });
}

/** Compute per-agent health from the current task set. */
export function agentHealth(tasks: AgentTask[]): AgentHealth[] {
  return AGENT_TYPES.map((agentType) => {
    const mine = tasks.filter((t) => t.agentType === agentType);
    const active = mine.filter((t) => t.state === 'active').length;
    const completed = mine.filter((t) => t.state === 'completed').length;
    const failed = mine.filter((t) => t.state === 'failed').length;
    const blocked = mine.filter((t) => t.state === 'blocked').length;
    const denom = completed + failed;
    const successRate = denom > 0 ? Math.round((completed / denom) * 100) / 100 : 1;
    const avgRuntimeMs =
      mine.length > 0
        ? Math.round(mine.reduce((a, t) => a + t.runtimeMs, 0) / mine.length)
        : 0;

    let status: AgentHealthStatus = 'HEALTHY';
    if (blocked > 0 || (denom >= 3 && successRate < 0.5)) status = 'DOWN';
    else if (failed > 0 || (denom >= 2 && successRate < 0.8)) status = 'DEGRADED';

    return { agentType, status, active, completed, failed, blocked, avgRuntimeMs, successRate };
  });
}
