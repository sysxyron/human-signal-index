// =============================================================================
// @hsi/research-agents — public API (WorldForge Phase 3)
// A multi-agent scientific RESEARCH engine. It turns a user's world CONCEPT into
// a structured, traceable, debate-ready simulation blueprint BEFORE a world is
// generated. 9 domain agents reason in dependency order, a skeptic falsifies the
// weakest claims, and a consensus agent synthesizes a buildable blueprint.
// Every atomic claim is tagged with a ProvenanceSource (the 6 traceability
// categories) AND a ScientificConfidenceTier. Pure, deterministic, zero deps.
//
// example: end-to-end run
//   import { runResearch, blueprintToWorldState } from '@hsi/research-agents';
//   const run = runResearch('A frozen super-earth being with crystal genetics.');
//   const world = blueprintToWorldState(run.blueprint);
//
// example: the flagship Chronid showcase
//   import { chronidResearchDemo } from '@hsi/research-agents';
//   const run = chronidResearchDemo();
//   run.consensus.summary;
// =============================================================================

// ---- core data model -------------------------------------------------------
export type {
  ResearchConcept,
  ConceptSignals,
  MetabolismRate,
  ProvenanceSource,
  Claim,
  Equation,
  Citation,
  AgentDomain,
  AgentOutput,
  Dispute,
  ConsensusReport,
  ResearchRunResult,
  SimulationBlueprint,
  AgentContext,
  Agent,
  ScientificConfidenceTier,
} from './types';

// ---- concept parser --------------------------------------------------------
export { parseConcept, type ParseConceptOptions } from './concept';

// ---- agents ----------------------------------------------------------------
export {
  physicsAgent,
  planetologyAgent,
  chemistryAgent,
  biologyAgent,
  evolutionAgent,
  intelligenceAgent,
  civilizationAgent,
  mathematicsAgent,
  riskAgent,
  skepticAgent,
  consensusAgent,
  DOMAIN_AGENTS,
  ALL_AGENTS,
  AGENTS_BY_DOMAIN,
  buildDisputes,
  buildConsensusReport,
  type RiskComparisonRow,
} from './agents';

// ---- orchestrator ----------------------------------------------------------
export { runResearch, type RunResearchOptions } from './orchestrator';

// ---- blueprint -------------------------------------------------------------
export {
  consensusToBlueprint,
  blueprintToWorldState,
  paramsToStateOverrides,
} from './blueprint';

// ---- demo ------------------------------------------------------------------
export { CHRONID_RESEARCH_CONCEPT, chronidResearchDemo } from './demo';

// ---- evidence-weighted consensus + claim reliability (Phase 5, additive) ---
// Applied by the app AFTER evidence is gathered. Does NOT modify the existing
// agent-confidence consensus. No '@hsi/evidence-engine' import (cycle-free).
export {
  evidenceWeightedConsensus,
  applyEvidenceToConsensus,
  computeClaimReliability,
  computeClaimReliabilities,
  type EvidenceWeightInput,
  type EvidenceWeightedResult,
  type ClaimReliability,
  type ClaimCoverage,
  type ComputeClaimReliabilityInput,
} from './consensus';

// ---- human review & governance (Phase 6, additive) -------------------------
// Governed Confidence = Research + Evidence + Reviewer. Folds a human reviewer
// signal on top of the evidence-weighted score. Plain numeric inputs only; no
// '@hsi/evidence-engine' import (cycle-free).
export {
  computeReviewerTrust,
  applyReviewerVerdictToEvidence,
  governedConfidence,
  aggregateReviewerValidation,
  type ReviewerVerdict,
  type ReviewerTrustInput,
  type ReviewerTrust,
  type GovernanceInput,
  type GovernedConfidenceResult,
  type ReviewerDecision,
} from './consensus';
