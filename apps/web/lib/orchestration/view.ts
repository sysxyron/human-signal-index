// =============================================================================
// HSI Phase 18 — client-safe view helpers for the Intelligence Operations Center
// UI (operations / runs / run replay / health / opportunities / escalations).
//
// PURE + CLIENT-SAFE: NO server-only imports. Maps the Phase-18 domain unions →
// color/label, formats progress / runtime / rates, reads jsonb out of records,
// and re-exports the demo view-models from the DAL's demo builders... but those
// are server-only, so this file owns its OWN client-safe demo builders from the
// @hsi/research-orchestrator + @hsi/intelligence-queue fixtures.
//
// EXPLAINABLE — every status carries a reason; nothing auto-acts; opportunities
// and escalations are proposals/issues for a human.
// =============================================================================

import type {
  AgentPerformanceView,
  EngineHealthStatus,
  EngineHealthView,
  EscalationSeverity,
  EscalationsData,
  HsinResearchEscalationRecord,
  HsinResearchOpportunityRecord,
  HsinResearchQueueRecord,
  HsinResearchRunEventRecord,
  HsinResearchRunRecord,
  HsinResearchTaskRecord,
  OperationsDashboardData,
  OpportunitiesData,
  PlatformHealthData,
  ResearchAgentType,
  ResearchPriority,
  ResearchRunReplayData,
  ResearchRunState,
  ResearchRunsData,
  ResearchTaskState,
} from '@hsi/shared-types';
import {
  orchestratorDemo,
  pipelineProgress,
  type EngineHealth,
} from '@hsi/research-orchestrator';

/* -------------------------------------------------------------------------- */
/* Shared decoration                                                           */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'cyan' | 'pink';
export interface Decorated {
  label: string;
  color: string;
  tone: Tone;
  description?: string;
}
const TONE_COLORS: Record<Tone, string> = {
  neutral: '#94A3B8', blue: '#3B82F6', purple: '#8B5CF6', green: '#10B981',
  orange: '#F59E0B', red: '#EF4444', cyan: '#06B6D4', pink: '#EC4899',
};
export function toneColor(tone: Tone): string {
  return TONE_COLORS[tone];
}
function titleize(v: string): string {
  return v.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/* -------------------------------------------------------------------------- */
/* Role gating (pure)                                                          */
/* -------------------------------------------------------------------------- */
const ROLE_RANK: Record<string, number> = {
  viewer: 0, contributor: 1, researcher: 2, reviewer: 3, editor: 3, curator: 4, admin: 5, owner: 6,
};
function rank(role?: string | null): number {
  return role ? (ROLE_RANK[role.toLowerCase()] ?? -1) : -1;
}
export function canResearch(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.researcher;
}
export function canCurate(role?: string | null): boolean {
  return rank(role) >= ROLE_RANK.curator;
}

/* -------------------------------------------------------------------------- */
/* Run state → decoration                                                      */
/* -------------------------------------------------------------------------- */
const TERMINAL_OK: ResearchRunState = 'COMPLETE';
const RUN_STATE_TONE: Partial<Record<ResearchRunState, Tone>> = {
  CREATED: 'neutral',
  QUEUED: 'cyan',
  COMPLETE: 'green',
  FAILED: 'red',
  ESCALATED: 'orange',
  GOVERNANCE: 'purple',
};
export function runStateDecor(state?: ResearchRunState | string | null): Decorated {
  if (!state) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  const tone = RUN_STATE_TONE[state as ResearchRunState] ?? 'blue';
  return { label: titleize(String(state)), color: TONE_COLORS[tone], tone };
}
export function isActiveState(state?: ResearchRunState | string | null): boolean {
  return Boolean(state) && state !== 'CREATED' && state !== TERMINAL_OK && state !== 'FAILED' && state !== 'ESCALATED';
}

/* -------------------------------------------------------------------------- */
/* Priority / status / severity / health / task / agent                         */
/* -------------------------------------------------------------------------- */
const PRIORITY_DECOR: Record<ResearchPriority, Decorated> = {
  CRITICAL: { label: 'Critical', color: TONE_COLORS.red, tone: 'red' },
  HIGH: { label: 'High', color: TONE_COLORS.orange, tone: 'orange' },
  NORMAL: { label: 'Normal', color: TONE_COLORS.blue, tone: 'blue' },
  LOW: { label: 'Low', color: TONE_COLORS.neutral, tone: 'neutral' },
};
export function priorityDecor(p?: ResearchPriority | string | null): Decorated {
  if (!p) return { label: 'Normal', color: TONE_COLORS.blue, tone: 'blue' };
  return PRIORITY_DECOR[p as ResearchPriority] ?? { label: titleize(String(p)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

const HEALTH_DECOR: Record<EngineHealthStatus, Decorated> = {
  HEALTHY: { label: 'Healthy', color: TONE_COLORS.green, tone: 'green' },
  DEGRADED: { label: 'Degraded', color: TONE_COLORS.orange, tone: 'orange' },
  DOWN: { label: 'Down', color: TONE_COLORS.red, tone: 'red' },
};
export function healthDecor(s?: EngineHealthStatus | string | null): Decorated {
  if (!s) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return HEALTH_DECOR[s as EngineHealthStatus] ?? { label: titleize(String(s)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

const SEVERITY_DECOR: Record<EscalationSeverity, Decorated> = {
  INFO: { label: 'Info', color: TONE_COLORS.blue, tone: 'blue' },
  WARNING: { label: 'Warning', color: TONE_COLORS.orange, tone: 'orange' },
  HIGH: { label: 'High', color: TONE_COLORS.red, tone: 'red' },
  CRITICAL: { label: 'Critical', color: TONE_COLORS.red, tone: 'red' },
};
export function severityDecor(s?: EscalationSeverity | string | null): Decorated {
  if (!s) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  return SEVERITY_DECOR[s as EscalationSeverity] ?? { label: titleize(String(s)), color: TONE_COLORS.neutral, tone: 'neutral' };
}

const TASK_STATE_TONE: Record<ResearchTaskState, Tone> = {
  pending: 'neutral', active: 'blue', completed: 'green', failed: 'red', blocked: 'orange',
};
export function taskStateDecor(s?: ResearchTaskState | string | null): Decorated {
  if (!s) return { label: 'Unknown', color: TONE_COLORS.neutral, tone: 'neutral' };
  const tone = TASK_STATE_TONE[s as ResearchTaskState] ?? 'neutral';
  return { label: titleize(String(s)), color: TONE_COLORS[tone], tone };
}

const AGENT_LABEL: Record<ResearchAgentType, string> = {
  research: 'Research', evidence: 'Evidence', temporal: 'Temporal', causal: 'Causal',
  counterfactual: 'Counterfactual', decision: 'Decision', outcome: 'Outcome', trust: 'Trust',
};
export function agentLabel(a?: ResearchAgentType | string | null): string {
  return a ? (AGENT_LABEL[a as ResearchAgentType] ?? titleize(String(a))) : 'Agent';
}

const ENGINE_LABEL: Record<string, string> = {
  research: 'Research Engine', evidence: 'Evidence Engine', temporal: 'Temporal Engine',
  causal: 'Causal Engine', counterfactual: 'Counterfactual Engine', decision: 'Decision Engine',
  outcome: 'Outcome Engine', calibration: 'Calibration Engine', trust: 'Trust Engine', governance: 'Governance Engine',
};
export function engineLabel(e?: string | null): string {
  return e ? (ENGINE_LABEL[e] ?? titleize(e)) : 'Engine';
}

/* -------------------------------------------------------------------------- */
/* Formatters                                                                  */
/* -------------------------------------------------------------------------- */
export function formatPct(v?: number | null, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(Math.max(0, Math.min(1, v)) * 100).toFixed(digits)}%`;
}
export function formatProgress(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
}
export function formatRuntime(ms?: number | null): string {
  const n = Math.max(0, ms ?? 0);
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`;
  return `${(n / 60_000).toFixed(1)}m`;
}
export function formatTrust(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${Math.round(Math.max(0, Math.min(100, v)))}`;
}
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
export function readStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string');
  if (isRecord(value)) {
    for (const k of ['items', 'list', 'values', 'evidence', 'stages', 'required_agents']) {
      const inner = value[k];
      if (Array.isArray(inner)) return inner.filter((x): x is string => typeof x === 'string');
    }
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/* DEMO builders — pure offline fixtures (client-safe). Always labeled "Demo".  */
/* -------------------------------------------------------------------------- */
const DEMO_NOW = '2026-06-09T12:00:00.000Z';
const ACTIVE_STATES: ResearchRunState[] = [
  'QUEUED', 'DISCOVERING', 'COLLECTING', 'ANALYZING', 'REASONING', 'EVIDENCING',
  'TEMPORAL', 'CAUSAL', 'COUNTERFACTUAL', 'DECISION', 'OUTCOME', 'CALIBRATION', 'TRUST', 'GOVERNANCE',
];

let _demo: ReturnType<typeof orchestratorDemo> | null = null;
function demoBundle(): ReturnType<typeof orchestratorDemo> {
  if (!_demo) _demo = orchestratorDemo();
  return _demo;
}

function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function demoRuns(): HsinResearchRunRecord[] {
  const states: ResearchRunState[] = ['DISCOVERING', 'EVIDENCING', 'TRUST', 'GOVERNANCE', 'COMPLETE', 'FAILED', 'ESCALATED'];
  return states.map((state, i) => ({
    id: `demo-run-${i}`,
    title: `Demo investigation ${i + 1}`,
    state,
    priority: (['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const)[i % 4],
    workflow_key: 'historical-investigation',
    evidence_count: 3 + i,
    confidence: 0.6 + i * 0.03,
    trust_score: 70 - i * 4,
    outcome_status: state === 'COMPLETE' ? 'successful' : undefined,
    created_at: DEMO_NOW,
    updated_at: DEMO_NOW,
  }));
}

function healthView(h: EngineHealth): EngineHealthView {
  return {
    engine: h.engine, status: h.status, ...(h.lastRun ? { lastRun: h.lastRun } : {}),
    successRate: h.successRate, failureRate: h.failureRate, queueDepth: h.queueDepth, detail: h.detail,
  };
}

export function demoOperationsDashboard(): OperationsDashboardData {
  const demo = demoBundle();
  const runs = demoRuns();
  const tasks: HsinResearchTaskRecord[] = demo.tasks.map((t) => ({
    id: t.id, run_id: t.runId, agent_type: t.agentType, stage: t.stage, state: t.state,
    attempts: t.attempts, max_attempts: t.maxAttempts, runtime_ms: t.runtimeMs, created_at: DEMO_NOW, updated_at: DEMO_NOW,
  }));
  const queue: HsinResearchQueueRecord[] = runs.slice(0, 3).map((r, i) => ({
    id: `demo-q-${i}`, run_id: r.id, priority: r.priority, status: 'queued', attempts: 0, max_attempts: 3,
    available_at: DEMO_NOW, enqueued_at: DEMO_NOW, created_at: DEMO_NOW,
  }));
  const opportunities: HsinResearchOpportunityRecord[] = demo.opportunities.map((o) => ({
    id: o.id, title: o.title, reason: o.reason, confidence: o.confidence, priority: o.priority,
    source: o.source, entity_id: o.entityId, status: 'proposed', created_at: DEMO_NOW,
  }));
  const escalations: HsinResearchEscalationRecord[] = [
    {
      id: demo.escalation.id, run_id: demo.escalation.runId, trigger: demo.escalation.trigger,
      severity: demo.escalation.severity, reason: demo.escalation.reason, evidence: { items: demo.escalation.evidence },
      recommendation: demo.escalation.recommendation, status: 'open', created_at: DEMO_NOW,
    },
  ];
  const health = demo.health.map(healthView);
  const agentPerformance: AgentPerformanceView[] = demo.agentHealth.map((h) => ({
    agentType: h.agentType, status: h.status, active: h.active, completed: h.completed,
    failed: h.failed, blocked: h.blocked, avgRuntimeMs: h.avgRuntimeMs, successRate: h.successRate,
  }));
  const overallStatus: EngineHealthStatus = health.some((h) => h.status === 'DOWN')
    ? 'DOWN' : health.some((h) => h.status === 'DEGRADED') ? 'DEGRADED' : 'HEALTHY';
  return {
    runsByState: countBy(runs, (r) => r.state ?? 'CREATED'),
    activeRuns: runs.filter((r) => ACTIVE_STATES.includes((r.state ?? '') as ResearchRunState)),
    queue, queueDepth: queue.length, opportunities, escalations, health, overallStatus, agentPerformance,
    recentFailures: runs.filter((r) => r.state === 'FAILED' || r.state === 'ESCALATED'),
    governanceBacklog: runs.filter((r) => r.state === 'GOVERNANCE').length, avgTrust: 60,
  };
}

export function demoResearchRuns(): ResearchRunsData {
  const runs = demoRuns();
  return { runs, byState: countBy(runs, (r) => r.state ?? 'CREATED') };
}

export function demoResearchRunReplay(id?: string): ResearchRunReplayData {
  const demo = demoBundle();
  const run = demo.run;
  const events: HsinResearchRunEventRecord[] = run.events.map((e, i) => ({
    id: `demo-ev-${i}`, run_id: id ?? run.id, from_state: e.from, to_state: e.to, actor: e.actor, reason: e.reason, at: e.at, created_at: e.at,
  }));
  const tasks: HsinResearchTaskRecord[] = demo.tasks.map((t) => ({
    id: t.id, run_id: id ?? run.id, agent_type: t.agentType, stage: t.stage, state: t.state,
    attempts: t.attempts, max_attempts: t.maxAttempts, runtime_ms: t.runtimeMs, created_at: DEMO_NOW, updated_at: DEMO_NOW,
  }));
  const assignments = demo.tasks.map((t, i) => ({
    id: `demo-asg-${i}`, run_id: id ?? run.id, task_id: t.id, agent_type: t.agentType, stage: t.stage, assigned_at: DEMO_NOW, created_at: DEMO_NOW,
  }));
  return {
    run: {
      id: id ?? run.id, title: run.title, state: run.state, priority: run.priority, workflow_key: run.workflow,
      evidence_count: 5, confidence: 0.74, trust_score: 73, outcome_status: 'successful', created_at: run.createdAt, updated_at: run.updatedAt,
    },
    events, tasks, assignments, escalations: [], progress: pipelineProgress(run.state),
  };
}

export function demoPlatformHealth(): PlatformHealthData {
  const d = demoOperationsDashboard();
  return { health: d.health, overallStatus: d.overallStatus, agentPerformance: d.agentPerformance };
}

export function demoOpportunities(): OpportunitiesData {
  const opportunities = demoOperationsDashboard().opportunities;
  return { opportunities, proposedCount: opportunities.length, acceptedCount: 0, rejectedCount: 0 };
}

export function demoEscalations(): EscalationsData {
  const escalations = demoOperationsDashboard().escalations;
  const bySeverity: Record<EscalationSeverity, number> = { INFO: 0, WARNING: 0, HIGH: 0, CRITICAL: 0 };
  for (const e of escalations) if (e.severity) bySeverity[e.severity] += 1;
  return { escalations, bySeverity, openCount: escalations.length };
}

/** Demo headline operations callouts for the platform operations strip. */
export function demoOperationsHighlights(): import('@hsi/shared-types').OperationsHighlights {
  const d = demoOperationsDashboard();
  return {
    activeRuns: d.activeRuns.length,
    queueDepth: d.queueDepth,
    openEscalations: d.escalations.length,
    proposedOpportunities: d.opportunities.length,
    overallStatus: d.overallStatus,
  };
}
