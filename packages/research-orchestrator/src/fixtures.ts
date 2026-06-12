// =============================================================================
// @hsi/research-orchestrator — deterministic offline fixtures + end-to-end demo.
//
// `orchestratorDemo()` creates a run, advances it through the pipeline (assigning
// agents per stage), discovers opportunities, raises an escalation, and computes
// platform health — all offline + deterministic. No Date.now / no Math.random.
// =============================================================================

import {
  advanceResearchRun,
  createResearchRun,
  PIPELINE,
} from './states';
import { assignAgents, agentHealth } from './agents';
import { discoverResearchOpportunities } from './discovery';
import { escalateResearchIssue } from './escalation';
import { platformHealth } from './health';
import { WORKFLOW_TEMPLATES } from './templates';
import type {
  AgentTask,
  DiscoveryInput,
  EngineHealthInput,
  ResearchRun,
} from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** Deterministic discovery inputs spanning every source. */
export const DEMO_DISCOVERY_INPUTS: DiscoveryInput[] = [
  { source: 'trust_drift', entityId: 'src-reuters', weight: 0.9, detail: 'Trust fell 72 → 48.' },
  { source: 'outcome_failure', entityId: 'dec-launch', weight: 0.7 },
  { source: 'alert', entityId: 'alert-17', weight: 0.6 },
  { source: 'narrative_spike', entityId: 'narr-supply', weight: 0.55 },
  { source: 'signal', entityId: 'sig-9001', weight: 0.4 },
  { source: 'evidence', entityId: 'ev-221', weight: 0.3 },
];

/** Deterministic engine-health inputs. */
export const DEMO_HEALTH_INPUTS: EngineHealthInput[] = [
  { engine: 'research', runs: 40, failures: 2, queueDepth: 5, lastRun: FIXTURE_NOW },
  { engine: 'evidence', runs: 38, failures: 1, queueDepth: 3, lastRun: FIXTURE_NOW },
  { engine: 'trust', runs: 20, failures: 6, queueDepth: 30, lastRun: FIXTURE_NOW },
  { engine: 'governance', runs: 4, failures: 3, queueDepth: 2, lastRun: FIXTURE_NOW },
];

/**
 * Drive a run from CREATED all the way to COMPLETE along the pipeline, assigning
 * agents at each stage. Returns the final run + the tasks. Deterministic.
 */
export function runFullPipeline(): { run: ResearchRun; tasks: AgentTask[] } {
  let run = createResearchRun(
    { id: 'run-demo', priority: 'HIGH', workflow: 'historical-investigation', title: 'Demo investigation' },
    { now: FIXTURE_NOW },
  );
  let tasks: AgentTask[] = [];
  // Advance until COMPLETE (or until a no-op). PIPELINE.length is the upper bound.
  for (let i = 0; i < PIPELINE.length + 2; i++) {
    const res = advanceResearchRun(run, { now: FIXTURE_NOW, actor: 'orchestrator' });
    if (!res.ok) break;
    run = res.run;
    const assigned = assignAgents(run, run.state, tasks, { now: FIXTURE_NOW });
    tasks = assigned.tasks;
    if (run.state === 'COMPLETE') break;
  }
  return { run, tasks };
}

/** Run the full orchestrator chain offline for a UI/demo. Deterministic. */
export function orchestratorDemo(): {
  now: string;
  run: ResearchRun;
  tasks: AgentTask[];
  agentHealth: ReturnType<typeof agentHealth>;
  opportunities: ReturnType<typeof discoverResearchOpportunities>;
  escalation: ReturnType<typeof escalateResearchIssue>;
  health: ReturnType<typeof platformHealth>;
  templates: typeof WORKFLOW_TEMPLATES;
} {
  const now = FIXTURE_NOW;
  const { run, tasks } = runFullPipeline();
  const opportunities = discoverResearchOpportunities(DEMO_DISCOVERY_INPUTS, { now });
  const escalation = escalateResearchIssue(
    { id: 'esc-demo', trigger: 'trust_collapse', runId: run.id, evidence: ['Trust fell 80 → 30 in one snapshot.'] },
    { now },
  );
  const health = platformHealth(DEMO_HEALTH_INPUTS);
  return {
    now,
    run,
    tasks,
    agentHealth: agentHealth(tasks),
    opportunities,
    escalation,
    health,
    templates: WORKFLOW_TEMPLATES,
  };
}
