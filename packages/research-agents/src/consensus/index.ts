// =============================================================================
// @hsi/research-agents — evidence-weighted consensus barrel (WorldForge Phase 5)
// ADDITIVE layer applied AFTER evidence is gathered. Does NOT replace the agent
// -confidence buildConsensusReport/consensusAgent. No '@hsi/evidence-engine'
// import (would create a dependency cycle).
// =============================================================================

export {
  evidenceWeightedConsensus,
  applyEvidenceToConsensus,
  type EvidenceWeightInput,
  type EvidenceWeightedResult,
} from './evidenceWeightedConsensus';

export {
  computeClaimReliability,
  computeClaimReliabilities,
  type ClaimReliability,
  type ClaimCoverage,
  type ComputeClaimReliabilityInput,
} from './claimReliability';

// ---- human review & governance (Phase 6, additive) -------------------------
// Sits ON TOP of evidence-weighted consensus, folding in a human reviewer
// signal. Plain numeric inputs only; no '@hsi/evidence-engine' import (cycle).
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
} from './governedConfidence';
