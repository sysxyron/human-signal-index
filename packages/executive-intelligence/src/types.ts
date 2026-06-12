// =============================================================================
// @hsi/executive-intelligence — public type surface (WorldForge/HSI Phase 22).
//
// THE COMMAND LAYER. This engine creates NO new intelligence — it OPERATES the
// intelligence built in Phases 1-21. From a UNIFIED SYSTEM STATE (assembled from
// research, evidence, decisions, outcomes, trust, forecasts, consensus,
// publishing, governance, and operations) it ranks strategic priorities, scores
// operational risk + strategic opportunity, computes executive attention, and
// builds explainable briefs + a daily intelligence report.
//
// PRINCIPLES (binding — identical to Phases 16-21):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every priority/risk/opportunity carries the numbers
//     + the reasoning that produced it. Every recommendation is ADVISORY:
//     autoPublish/autoApprove/autoAct/autoGovern = false. Human decisions only.
// =============================================================================

/** The kind of thing a strategic priority points at. */
export type PriorityKind =
  | 'risk' | 'opportunity' | 'investigation' | 'forecast'
  | 'warning' | 'governance' | 'consensus' | 'trust';

/** Attention level for triage. */
export type AttentionLevel = 'routine' | 'notable' | 'elevated' | 'urgent';

/** Severity for risks / governance items. */
export type ExecutiveSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ---- Unified system state (the cross-system model) --------------------------

/** A normalised investigation summary. */
export interface UnifiedInvestigation {
  id: string;
  title: string;
  state: string;
  contributorCount: number;
  agreementScore?: number;
  contentiousness?: number;
}
/** A normalised consensus summary. */
export interface UnifiedConsensus {
  investigationId: string;
  position?: string;
  agreement: number;
  confidence: number;
  disputed: boolean;
}
/** A normalised forecast summary. */
export interface UnifiedForecast {
  id: string;
  prediction: string;
  confidence: number;
  reliability: number;
  status: string;
}
/** A normalised early-warning summary. */
export interface UnifiedWarning {
  id: string;
  kind: string;
  level: 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL';
  title: string;
}
/** A normalised trust summary (per entity or aggregate). */
export interface UnifiedTrust {
  entityType: string;
  entityId: string;
  score: number; // 0..100
  band: 'low' | 'medium' | 'high';
  trend?: 'improving' | 'stable' | 'degrading' | 'volatile';
}
/** A pending governance item (review/proposal/escalation/decision). */
export interface UnifiedGovernanceItem {
  id: string;
  source: 'recalibration' | 'consensus' | 'publication' | 'escalation' | 'research_opportunity' | 'executive';
  label: string;
  severity: ExecutiveSeverity;
}
/** A normalised research opportunity. */
export interface UnifiedOpportunity {
  id: string;
  title: string;
  confidence: number;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
}
/** A normalised scenario summary. */
export interface UnifiedScenario {
  id: string;
  title: string;
  state: string;
  likelihood: number;
}
/** Operations + publishing + outcome rollups. */
export interface UnifiedOperations {
  activeRuns: number;
  queueDepth: number;
  openEscalations: number;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'DOWN';
}
export interface UnifiedPublishing {
  published: number;
  inReview: number;
  retracted: number;
}
export interface UnifiedOutcomes {
  successRate?: number;
  failureRate?: number;
}

/** The full cross-system model every executive view derives from. */
export interface UnifiedSystemState {
  investigations: UnifiedInvestigation[];
  consensus: UnifiedConsensus[];
  forecasts: UnifiedForecast[];
  warnings: UnifiedWarning[];
  trust: UnifiedTrust[];
  opportunities: UnifiedOpportunity[];
  scenarios: UnifiedScenario[];
  governanceQueue: UnifiedGovernanceItem[];
  operations: UnifiedOperations;
  publishing: UnifiedPublishing;
  outcomes: UnifiedOutcomes;
  generatedAt: string;
}

/** Raw inputs to buildUnifiedSystemState (each list optional). */
export interface UnifiedInputs {
  investigations?: UnifiedInvestigation[];
  consensus?: UnifiedConsensus[];
  forecasts?: UnifiedForecast[];
  warnings?: UnifiedWarning[];
  trust?: UnifiedTrust[];
  opportunities?: UnifiedOpportunity[];
  scenarios?: UnifiedScenario[];
  governanceQueue?: UnifiedGovernanceItem[];
  operations?: Partial<UnifiedOperations>;
  publishing?: Partial<UnifiedPublishing>;
  outcomes?: UnifiedOutcomes;
}

// ---- Strategic priority -----------------------------------------------------

/** Inputs to the priority computation for one item. */
export interface PriorityInput {
  id: string;
  kind: PriorityKind;
  title: string;
  /** 0..1 time-sensitivity. */
  urgency?: number;
  /** 0..1 consequence. */
  impact?: number;
  /** 0..1 confidence in the assessment. */
  confidence?: number;
  /** 0..1 strength of supporting evidence. */
  evidenceStrength?: number;
  /** 0..1 risk magnitude (raises priority). */
  riskScore?: number;
  /** 0..1 opportunity magnitude (raises priority). */
  opportunityScore?: number;
  /** 0..100 trust of the relevant entity (low trust raises priority). */
  trustScore?: number;
  /** 0..1 consensus agreement (low agreement = contested → raises priority). */
  consensusAgreement?: number;
  /** Whether a governance decision is pending. */
  governancePending?: boolean;
  entityRef?: string;
}

/** A ranked strategic priority. */
export interface StrategicPriority {
  id: string;
  kind: PriorityKind;
  title: string;
  /** 0..100 composite priority score. */
  score: number;
  urgency: number;
  impact: number;
  confidenceWeight: number;
  evidenceWeight: number;
  rank: number;
  attentionLevel: AttentionLevel;
  recommendation: string;
  explanation: string[];
  limitations: string[];
  entityRef?: string;
}

// ---- Risk + opportunity + attention -----------------------------------------

/** An operational risk. */
export interface OperationalRisk {
  id: string;
  title: string;
  source: string;
  severity: ExecutiveSeverity;
  /** 0..1 likelihood. */
  likelihood: number;
  /** 0..1 impact. */
  impact: number;
  /** 0..100 risk score. */
  score: number;
  explanation: string[];
  recommendation: string;
}

/** A strategic opportunity. */
export interface StrategicOpportunity {
  id: string;
  title: string;
  source: string;
  /** 0..1 value. */
  value: number;
  /** 0..1 confidence. */
  confidence: number;
  /** 0..100 opportunity score. */
  score: number;
  explanation: string[];
  recommendation: string;
}

/** The executive attention rollup. */
export interface ExecutiveAttention {
  /** 0..100 — how much leadership attention the system demands now. */
  index: number;
  level: AttentionLevel;
  /** The items most demanding attention. */
  items: { id: string; label: string; level: AttentionLevel; reason: string }[];
  explanation: string[];
}

// ---- Snapshot + brief + report ----------------------------------------------

/** The full executive snapshot. */
export interface ExecutiveSnapshot {
  strategicPriorities: StrategicPriority[];
  operationalRisks: OperationalRisk[];
  opportunities: StrategicOpportunity[];
  attention: ExecutiveAttention;
  investigations: { active: number; disputed: number };
  consensus: { forming: number; disputed: number };
  forecasts: { active: number; failing: number; avgConfidence: number };
  warnings: { critical: number; total: number };
  governanceQueue: UnifiedGovernanceItem[];
  executiveSummary: string;
  limitations: string[];
  generatedAt: string;
}

/** The kind of brief. */
export type BriefKind = 'daily' | 'weekly' | 'critical' | 'governance' | 'forecast' | 'operations';

/** One section of a brief. */
export interface BriefSection {
  key: string;
  title: string;
  items: string[];
  /** Source references backing the section. */
  sources: string[];
}

/** An executive brief — explainable, evidence-linked, human-readable. */
export interface ExecutiveBrief {
  kind: BriefKind;
  title: string;
  headline: string;
  sections: BriefSection[];
  limitations: string[];
  generatedAt: string;
}

/** The full daily intelligence report. */
export interface DailyIntelligenceReport {
  title: string;
  date: string;
  snapshot: ExecutiveSnapshot;
  brief: ExecutiveBrief;
  topRisks: OperationalRisk[];
  topOpportunities: StrategicOpportunity[];
  generatedAt: string;
}

// ---- Governance -------------------------------------------------------------

export type ExecutiveDecisionType = 'approved' | 'rejected' | 'archived';

/** A queued executive review item. */
export interface ExecutiveReviewQueueItem {
  id: string;
  priorityId: string;
  title: string;
  kind: PriorityKind;
  severity: ExecutiveSeverity;
  queuedAt: string;
  status: 'queued';
}

/** A human executive decision. */
export interface ExecutiveDecision {
  reviewId: string;
  priorityId: string;
  decision: ExecutiveDecisionType;
  reviewer: string;
  reason: string;
  previousStatus: string;
  reversible: boolean;
  auditTrail: string[];
  at: string;
}
