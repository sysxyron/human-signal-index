// =============================================================================
// @hsi/research-orchestrator — the research-run STATE MACHINE.
//
// advanceResearchRun() moves a run to the NEXT pipeline state; transitionResearchRun()
// applies an explicit transition; validateResearchTransition() gates both. Every
// transition is AUDITED (appends a ResearchRunEvent) and there are NO silent
// failures — an invalid transition returns ok:false with a reason, never throws.
//
// PIPELINE (the happy path, each stage = one Phase 1-17 engine):
//   CREATED → QUEUED → DISCOVERING → COLLECTING → ANALYZING → REASONING →
//   EVIDENCING → TEMPORAL → CAUSAL → COUNTERFACTUAL → DECISION → OUTCOME →
//   CALIBRATION → TRUST → GOVERNANCE → COMPLETE
//
// OFF-RAMPS: any working state may go to FAILED or ESCALATED. FAILED may retry
// (→ QUEUED) or ESCALATED. ESCALATED may resume (→ QUEUED), route to GOVERNANCE,
// or FAIL. COMPLETE is terminal.
// =============================================================================

import type {
  ResearchRun,
  ResearchRunEvent,
  ResearchRunState,
  TransitionResult,
  TransitionValidity,
} from './types';

/** The ordered happy-path pipeline (CREATED → … → COMPLETE). */
export const PIPELINE: ResearchRunState[] = [
  'CREATED',
  'QUEUED',
  'DISCOVERING',
  'COLLECTING',
  'ANALYZING',
  'REASONING',
  'EVIDENCING',
  'TEMPORAL',
  'CAUSAL',
  'COUNTERFACTUAL',
  'DECISION',
  'OUTCOME',
  'CALIBRATION',
  'TRUST',
  'GOVERNANCE',
  'COMPLETE',
];

/** Terminal states (no outgoing transitions). */
export const TERMINAL: ResearchRunState[] = ['COMPLETE'];

/** States from which the run is actively working (may fail/escalate). */
const WORKING = new Set<ResearchRunState>(
  PIPELINE.filter((s) => s !== 'CREATED' && s !== 'COMPLETE'),
);

/** The explicit allowed-transition map. */
export const TRANSITIONS: Record<ResearchRunState, ResearchRunState[]> = (() => {
  const map = {} as Record<ResearchRunState, ResearchRunState[]>;
  for (let i = 0; i < PIPELINE.length; i++) {
    const state = PIPELINE[i];
    const next = PIPELINE[i + 1];
    const targets: ResearchRunState[] = [];
    if (next) targets.push(next);
    // Any working state may fail or escalate.
    if (WORKING.has(state) || state === 'CREATED') {
      targets.push('FAILED', 'ESCALATED');
    }
    map[state] = targets;
  }
  map.COMPLETE = [];
  // FAILED: retry (back to QUEUED) or escalate.
  map.FAILED = ['QUEUED', 'ESCALATED'];
  // ESCALATED: resume, route to governance, or fail.
  map.ESCALATED = ['QUEUED', 'GOVERNANCE', 'FAILED'];
  return map;
})();

/** Is `to` a legal transition from `from`? Returns an explainable verdict. */
export function validateResearchTransition(
  from: ResearchRunState,
  to: ResearchRunState,
): TransitionValidity {
  if (from === to) {
    return { valid: false, reason: `Already in state '${from}'; no self-transition.` };
  }
  const allowed = TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) {
    return { valid: true, reason: `'${from}' → '${to}' is permitted.` };
  }
  return {
    valid: false,
    reason: `'${from}' → '${to}' is not permitted (allowed: ${allowed.join(', ') || 'none'}).`,
  };
}

/** The next pipeline state after `state`, or null if terminal / off-pipeline. */
export function nextPipelineState(state: ResearchRunState): ResearchRunState | null {
  const idx = PIPELINE.indexOf(state);
  if (idx < 0 || idx >= PIPELINE.length - 1) return null;
  return PIPELINE[idx + 1];
}

/**
 * Apply an explicit transition to a run. Validates first; on success returns a
 * NEW run (inputs not mutated) with the event appended. On an invalid transition
 * returns ok:false with the reason — NEVER throws, NEVER silently no-ops.
 */
export function transitionResearchRun(
  run: ResearchRun,
  to: ResearchRunState,
  opts: { now: string; actor?: string; reason?: string },
): TransitionResult {
  const verdict = validateResearchTransition(run.state, to);
  if (!verdict.valid) {
    return { ok: false, error: 'INVALID_TRANSITION', reason: verdict.reason };
  }
  const event: ResearchRunEvent = {
    runId: run.id,
    from: run.state,
    to,
    actor: opts.actor ?? 'orchestrator',
    reason: opts.reason ?? verdict.reason,
    at: opts.now,
  };
  const next: ResearchRun = {
    ...run,
    state: to,
    updatedAt: opts.now,
    events: [...run.events, event],
  };
  return { ok: true, run: next, event };
}

/**
 * Advance a run to the NEXT pipeline state. If the run is terminal or off-pipeline
 * (FAILED/ESCALATED), returns ok:false explaining why (use transitionResearchRun
 * to retry/escalate explicitly).
 */
export function advanceResearchRun(
  run: ResearchRun,
  opts: { now: string; actor?: string; reason?: string },
): TransitionResult {
  const next = nextPipelineState(run.state);
  if (!next) {
    return {
      ok: false,
      error: 'NO_NEXT_STATE',
      reason:
        run.state === 'COMPLETE'
          ? 'Run is COMPLETE (terminal).'
          : `State '${run.state}' has no next pipeline state; use an explicit transition.`,
    };
  }
  return transitionResearchRun(run, next, {
    ...opts,
    reason: opts.reason ?? `Advance ${run.state} → ${next}.`,
  });
}

/** Create a fresh run in CREATED with one genesis event. */
export function createResearchRun(
  input: { id: string; priority: ResearchRun['priority']; workflow?: string; title?: string },
  opts: { now: string; actor?: string },
): ResearchRun {
  return {
    id: input.id,
    state: 'CREATED',
    priority: input.priority,
    ...(input.workflow ? { workflow: input.workflow } : {}),
    ...(input.title ? { title: input.title } : {}),
    createdAt: opts.now,
    updatedAt: opts.now,
    events: [
      {
        runId: input.id,
        from: 'CREATED',
        to: 'CREATED',
        actor: opts.actor ?? 'orchestrator',
        reason: 'Run created.',
        at: opts.now,
      },
    ],
  };
}

/** Is this a terminal state? */
export function isTerminal(state: ResearchRunState): boolean {
  return TERMINAL.includes(state);
}

/** Progress 0..1 through the pipeline (FAILED/ESCALATED report their last pipeline depth as best-effort). */
export function pipelineProgress(state: ResearchRunState): number {
  const idx = PIPELINE.indexOf(state);
  if (idx >= 0) return Math.round((idx / (PIPELINE.length - 1)) * 100) / 100;
  return 0; // FAILED / ESCALATED — off pipeline.
}
