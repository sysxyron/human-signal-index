// =============================================================================
// @hsi/research-agents — core data model (WorldForge Phase 3)
// A multi-agent scientific RESEARCH engine. It turns a user's world CONCEPT into
// a structured, traceable, debate-ready simulation blueprint BEFORE a world is
// generated. Every atomic claim carries a ProvenanceSource (where it came from)
// AND a ScientificConfidenceTier (how grounded it is) — full traceability.
// Pure, deterministic, zero runtime dependencies.
// =============================================================================

import type { ScientificConfidenceTier } from '@hsi/world-models';

// Re-export the shared tier type so consumers of this package never have to
// reach into @hsi/world-models for the classification ladder.
export type { ScientificConfidenceTier } from '@hsi/world-models';

// -----------------------------------------------------------------------------
// Concept
// -----------------------------------------------------------------------------

/** Pace of metabolism inferred from the concept text. */
export type MetabolismRate = 'ultra-slow' | 'slow' | 'normal' | 'fast';

/**
 * Parsed, structured features extracted from a free-text concept. Every field is
 * optional except `keywords` — `parseConcept` always populates `keywords`, and
 * fills the rest only when the text supports it (Earth-like defaults otherwise).
 */
export interface ConceptSignals {
  /** Subjective day length expressed in Earth years (e.g. 1000). */
  subjectiveDayYears?: number;
  /** Whether the world is frozen / icy / cold. */
  frozen?: boolean;
  /** Surface gravity in g (Earth = 1). */
  gravityG?: number;
  /** Whether the planet is a super-Earth. */
  superEarth?: boolean;
  /** Genetic / replication substrate, e.g. 'crystal' | 'silicon' | 'DNA'. */
  geneticsSubstrate?: string;
  /** Cognitive / neural substrate, e.g. 'geological mineral neural network'. */
  neuralSubstrate?: string;
  /** Inferred metabolic pace. */
  metabolismRate?: MetabolismRate;
  /** Organism lifespan in years (e.g. 1e9 for a billion-year being). */
  lifespanYears?: number;
  /** Host star spectral type, e.g. 'M' | 'G'. */
  starType?: string;
  /** Always present: lower-cased salient keywords extracted from the text. */
  keywords: string[];
}

/** A user's world concept, parsed into structured signals. */
export interface ResearchConcept {
  id?: string;
  text: string;
  title?: string;
  extracted: ConceptSignals;
}

// -----------------------------------------------------------------------------
// Traceability
// -----------------------------------------------------------------------------

/**
 * The 6 traceability categories. EVERY claim is tagged with exactly one, so a
 * reader can always answer "where did this come from?".
 */
export type ProvenanceSource =
  | 'user-input' // echoed straight from the user's concept text
  | 'prior-agent' // derived from an earlier agent's output (a dependency)
  | 'known-science' // textbook / observed fact
  | 'model-inference' // computed here from signals + formulas
  | 'speculative-assumption' // an explicit, flagged assumption
  | 'unsupported-generation'; // generated with no grounding (weakest; falsifiable)

/** The smallest traceable unit of reasoning produced by an agent. */
export interface Claim {
  id: string;
  text: string;
  source: ProvenanceSource;
  tier: ScientificConfidenceTier;
  /** 0..1 confidence this claim is physically real. */
  confidence: number;
  /** ids of prior claims / agent domains / 'user-input' this claim rests on. */
  dependsOn?: string[];
}

/** A named quantitative relation an agent cites. */
export interface Equation {
  name: string;
  expression: string;
  explanation: string;
  tier: ScientificConfidenceTier;
}

/** Citations are PLACEHOLDERS in Phase 3 (no real bibliography yet). */
export interface Citation {
  id: string;
  label: string;
  kind: 'placeholder';
  note?: string;
}

// -----------------------------------------------------------------------------
// Agents
// -----------------------------------------------------------------------------

/** The 11 agent domains (9 domain agents + skeptic + consensus). */
export type AgentDomain =
  | 'physics'
  | 'planetology'
  | 'chemistry'
  | 'biology'
  | 'evolution'
  | 'intelligence'
  | 'civilization'
  | 'mathematics'
  | 'risk'
  | 'skeptic'
  | 'consensus';

/** The structured output of a single agent. */
export interface AgentOutput {
  domain: AgentDomain;
  title: string;
  summary: string;
  assumptions: string[];
  equations: Equation[];
  knownScience: string[];
  plausibleExtrapolations: string[];
  speculativeClaims: string[];
  /** 0..100 — more speculative/fictional claims raise this. */
  uncertaintyScore: number;
  /** 0..100 — inverse-ish of uncertainty; grounded claims raise this. */
  confidenceScore: number;
  citations: Citation[];
  dependencies: AgentDomain[];
  counterarguments: string[];
  /** Parameters mapped toward WorldState fields (e.g. planet.gravityG). */
  recommendedParameters: Record<string, number | string | boolean>;
  /** The traceable atomic units this agent produced. */
  claims: Claim[];
}

// -----------------------------------------------------------------------------
// Debate
// -----------------------------------------------------------------------------

/** A challenge raised by the skeptic against a specific claim/domain. */
export interface Dispute {
  id: string;
  raisedBy: 'skeptic';
  targetDomain: AgentDomain;
  targetClaimId?: string;
  severity: 'low' | 'medium' | 'high';
  challenge: string;
  resolution?: string;
  status: 'open' | 'mitigated' | 'accepted';
}

/** The consensus agent's synthesis across all agents + disputes. */
export interface ConsensusReport {
  summary: string;
  /** 0..100 aggregate of agent confidence minus dispute penalties. */
  overallConfidence: number;
  /** 0..100; LOWER = more disagreement among agents. */
  agreementScore: number;
  /** Count of all claims by tier across all agents. */
  classificationBreakdown: Record<ScientificConfidenceTier, number>;
  keyFindings: string[];
  openDisputes: Dispute[];
  recommendedParameters: Record<string, number | string | boolean>;
  blueprintNotes: string[];
}

// -----------------------------------------------------------------------------
// Blueprint + run result
// -----------------------------------------------------------------------------

/** A simulation blueprint ready to be turned into a real WorldState. */
export interface SimulationBlueprint {
  worldName: string;
  universeType: string;
  /** Deep-partial WorldState overrides ready for createWorld(). */
  stateOverrides: Record<string, unknown>;
  rationale: string[];
  confidence: number;
}

/** The full result of a research run. */
export interface ResearchRunResult {
  concept: ResearchConcept;
  /** The 9 domain agents + the skeptic (consensus lives in `consensus`). */
  agentOutputs: AgentOutput[];
  disputes: Dispute[];
  consensus: ConsensusReport;
  blueprint: SimulationBlueprint;
  createdAtSeed?: string;
}

// -----------------------------------------------------------------------------
// Agent runtime contract
// -----------------------------------------------------------------------------

/** Read-only access to prior agents' outputs during a run. */
export interface AgentContext {
  /** Outputs of agents that have already run, keyed by domain. */
  prior: Map<AgentDomain, AgentOutput>;
  /** Disputes raised so far (populated for the consensus agent). */
  disputes?: Dispute[];
  /** Optional deterministic seed for tie-breaks (never used for randomness). */
  seed?: string;
}

/** The contract every agent implements. */
export interface Agent {
  domain: AgentDomain;
  dependencies: AgentDomain[];
  analyze(concept: ResearchConcept, context: AgentContext): AgentOutput;
}
