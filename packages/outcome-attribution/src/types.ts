// =============================================================================
// @hsi/outcome-attribution — types. PURE (no DB, no UI, no Date.now()).
//
// This engine measures EFFECTIVENESS, not activity. It models the chain
//   Signal → Investigation → Review → Governance → Publication → Outcome
// (single AND many-to-many), scores IMPACT per entity, and attributes outcomes
// back to the contributors/teams that produced them — with anti-gaming controls
// so impact cannot be self-attributed, circular, or double-counted.
//
// GOVERNANCE: impact is recognition/measurement only. It influences trust
// (impact → trust), never the reverse, and NEVER changes RBAC.
// =============================================================================

/** Outcome taxonomy (Deliverable 9). */
export type OutcomeType =
  | 'VERIFIED_FINDING'
  | 'GOVERNANCE_ACTION'
  | 'POLICY_CHANGE'
  | 'RISK_REDUCTION'
  | 'NARRATIVE_CORRECTION'
  | 'INVESTIGATION_COMPLETED'
  | 'PUBLICATION_RELEASED'
  | 'EXTERNAL_ACTION'
  | 'OTHER';

/** Entities that participate in attribution chains. */
export type EntityType =
  | 'signal'
  | 'investigation'
  | 'review'
  | 'governance'
  | 'publication'
  | 'outcome'
  | 'contributor'
  | 'team';

export interface EntityRef {
  type: EntityType;
  id: string;
}

/** Edge relationship types in the attribution ledger (Deliverable 11). */
export type RelationshipType =
  | 'signal_to_investigation'
  | 'investigation_to_review'
  | 'review_to_governance'
  | 'governance_to_publication'
  | 'investigation_to_publication'
  | 'publication_to_outcome'
  | 'investigation_to_outcome'
  | 'contributor_to_outcome'
  | 'team_to_outcome';

/** A directed attribution edge with a 0..1 weight. */
export interface AttributionEdge {
  origin: EntityRef;
  destination: EntityRef;
  relationship: RelationshipType;
  weight: number; // 0..1
  /** The contributor who created the ORIGIN (for self-attribution checks). */
  originOwner?: string | null;
  /** The contributor who created the DESTINATION. */
  destinationOwner?: string | null;
}

/** One step of a resolved chain. */
export interface ChainLink {
  from: EntityRef;
  to: EntityRef;
  relationship: RelationshipType;
  weight: number;
}

/** A resolved outcome chain (Deliverable 2). */
export interface OutcomeChain {
  outcome: EntityRef;
  links: ChainLink[];
  /** Product of link weights (0..1) — how strongly the outcome is attributable along this chain. */
  strength: number;
  /** Distinct origins feeding this outcome (many-to-many). */
  origins: EntityRef[];
}

// ---- Impact inputs (Deliverable 3) ----------------------------------------
export interface ImpactInputs {
  acceptedFindings: number; // count
  governanceActions: number; // count
  publicationQuality: number; // 0..100
  traceability: number; // 0..100
  evidenceQuality: number; // 0..100
  verificationLevel: number; // 0..1
}

// ---- Signal effectiveness (Deliverable 4) ---------------------------------
export interface SignalEffectivenessInputs {
  signalsSubmitted: number;
  ledToInvestigation: number;
  ledToAcceptedFinding: number;
  ledToPublication: number;
  ledToGovernanceAction: number;
  ledToVerifiedOutcome: number;
}
export interface SignalEffectiveness {
  investigationRate: number; // 0..100
  findingRate: number;
  publicationRate: number;
  governanceRate: number;
  verifiedRate: number;
  score: number; // 0..100 headline effectiveness
}

// ---- Investigation impact (Deliverable 5) ---------------------------------
export interface InvestigationImpactInputs {
  acceptedFindings: number;
  governanceActions: number;
  publications: number;
  realOutcomes: number;
}

// ---- Contributor / team impact (Deliverables 6,7) -------------------------
export interface ContributorImpactInputs {
  verifiedFindings: number;
  governanceActions: number;
  publicationsDriven: number;
  outcomesCreated: number;
  /** Sum of attribution weights credited to this contributor (anti-gaming filtered). */
  attributedWeight: number;
}
export interface TeamImpactInputs {
  verifiedFindings: number;
  governanceActions: number;
  publications: number;
  outcomesCreated: number;
  members: number;
}

// ---- Publication reach (Deliverable 8) ------------------------------------
export interface PublicationReachInputs {
  published: boolean;
  publicationQuality: number; // 0..100
  traceability: number; // 0..100
  evidenceVolume: number; // count
  outcomesProduced: number; // count
}
