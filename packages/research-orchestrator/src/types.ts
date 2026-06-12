// =============================================================================
// @hsi/research-orchestrator — public type surface (WorldForge/HSI Phase 18).
//
// The INTELLIGENCE OPERATIONS CENTER engine: a deterministic research-run state
// machine, an agent-coordination layer, automated opportunity discovery, an
// escalation engine, workflow templates, and platform health monitoring. It
// COORDINATES the Phase 1-17 engines — it does NOT create AGI, never auto-acts,
// and always routes opportunities/escalations/overrides through a human.
//
// PRINCIPLES (binding — identical to Phases 16-17):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every transition/assignment/escalation carries the
//     reason that produced it. NO silent failures; nothing is auto-published.
// =============================================================================

import type { QueuePriority } from '@hsi/intelligence-queue';

export type { QueuePriority } from '@hsi/intelligence-queue';

/**
 * The lifecycle state of a research run. The non-terminal states form the
 * intelligence PIPELINE (CREATED → … → GOVERNANCE → COMPLETE), routing the run
 * through every Phase 1-17 engine in order. FAILED / ESCALATED are off-ramps.
 */
export type ResearchRunState =
  | 'CREATED'
  | 'QUEUED'
  | 'DISCOVERING'
  | 'COLLECTING'
  | 'ANALYZING'
  | 'REASONING'
  | 'EVIDENCING'
  | 'TEMPORAL'
  | 'CAUSAL'
  | 'COUNTERFACTUAL'
  | 'DECISION'
  | 'OUTCOME'
  | 'CALIBRATION'
  | 'TRUST'
  | 'GOVERNANCE'
  | 'COMPLETE'
  | 'FAILED'
  | 'ESCALATED';

/** An audited record of one state transition. */
export interface ResearchRunEvent {
  runId: string;
  from: ResearchRunState;
  to: ResearchRunState;
  /** Human/automation actor that caused the transition. */
  actor: string;
  reason: string;
  at: string;
}

/** A research run — the unit of work the orchestrator drives. */
export interface ResearchRun {
  id: string;
  state: ResearchRunState;
  priority: QueuePriority;
  /** Workflow template id driving this run (optional). */
  workflow?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  /** Append-only transition history. */
  events: ResearchRunEvent[];
}

/** Result of a transition (never throws; invalid → ok:false with a reason). */
export type TransitionResult =
  | { ok: true; run: ResearchRun; event: ResearchRunEvent }
  | { ok: false; error: string; reason: string };

/** Validity verdict for a proposed transition. */
export interface TransitionValidity {
  valid: boolean;
  reason: string;
}

// ---- Agents -----------------------------------------------------------------

/** The eight specialised research agents the coordinator manages. */
export type AgentType =
  | 'research'
  | 'evidence'
  | 'temporal'
  | 'causal'
  | 'counterfactual'
  | 'decision'
  | 'outcome'
  | 'trust';

/** The state of a single agent task. */
export type AgentTaskState =
  | 'pending'
  | 'active'
  | 'completed'
  | 'failed'
  | 'blocked';

/** A unit of agent work attached to a run + the state it serves. */
export interface AgentTask {
  id: string;
  runId: string;
  agentType: AgentType;
  /** The run state this task advances. */
  stage: ResearchRunState;
  state: AgentTaskState;
  attempts: number;
  maxAttempts: number;
  /** Accumulated runtime in ms (advisory). */
  runtimeMs: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

/** An assignment of an agent to a run stage. */
export interface AgentAssignment {
  runId: string;
  stage: ResearchRunState;
  agentType: AgentType;
  taskId: string;
  at: string;
}

/** Per-agent health rollup. */
export type AgentHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';
export interface AgentHealth {
  agentType: AgentType;
  status: AgentHealthStatus;
  active: number;
  completed: number;
  failed: number;
  blocked: number;
  /** Mean runtime (ms) across the agent's tasks. */
  avgRuntimeMs: number;
  /** completed / (completed + failed), 0..1. */
  successRate: number;
}

// ---- Discovery --------------------------------------------------------------

/** The signal classes automated discovery scans. */
export type OpportunitySource =
  | 'signal'
  | 'evidence'
  | 'alert'
  | 'trust_drift'
  | 'outcome_failure'
  | 'narrative_spike';

/** A PROPOSED research opportunity (never auto-published). */
export interface ResearchOpportunity {
  id: string;
  title: string;
  reason: string;
  /** 0..1 confidence the opportunity is worth investigating. */
  confidence: number;
  priority: QueuePriority;
  source: OpportunitySource;
  /** Optional originating entity (signal/narrative/source id). */
  entityId?: string;
  createdAt: string;
  status: 'proposed';
}

/** A raw discovery input row (any source). */
export interface DiscoveryInput {
  source: OpportunitySource;
  entityId?: string;
  title?: string;
  /** 0..1 strength/severity of the signal. */
  weight?: number;
  detail?: string;
}

// ---- Escalation -------------------------------------------------------------

/** What triggered an escalation. */
export type EscalationTrigger =
  | 'repeated_failures'
  | 'trust_collapse'
  | 'calibration_drift'
  | 'missing_evidence'
  | 'governance_backlog'
  | 'queue_blockage';

export type EscalationSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

/** An escalation requiring human attention (never auto-resolved). */
export interface EscalationRecord {
  id: string;
  runId?: string;
  trigger: EscalationTrigger;
  severity: EscalationSeverity;
  reason: string;
  evidence: string[];
  recommendation: string;
  createdAt: string;
  status: 'open';
}

// ---- Workflow templates -----------------------------------------------------

/** A reusable research workflow template. */
export interface ResearchWorkflowTemplate {
  id: string;
  name: string;
  description: string;
  /** Ordered run states this workflow drives through. */
  stages: ResearchRunState[];
  requiredAgents: AgentType[];
  /** Minimum evidence items before COMPLETE. */
  requiredEvidence: number;
  /** Whether a human governance step is mandatory. */
  governanceRequired: boolean;
}

// ---- Health -----------------------------------------------------------------

/** The ten engines the operations center monitors. */
export type EngineName =
  | 'research'
  | 'evidence'
  | 'temporal'
  | 'causal'
  | 'counterfactual'
  | 'decision'
  | 'outcome'
  | 'calibration'
  | 'trust'
  | 'governance';

export type EngineHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

/** A single engine's health snapshot. */
export interface EngineHealth {
  engine: EngineName;
  status: EngineHealthStatus;
  lastRun?: string;
  /** 0..1 success rate over the window. */
  successRate: number;
  /** 0..1 failure rate over the window. */
  failureRate: number;
  queueDepth: number;
  detail: string;
}

/** Inputs to an engine-health computation. */
export interface EngineHealthInput {
  engine: EngineName;
  lastRun?: string;
  runs?: number;
  failures?: number;
  queueDepth?: number;
}
