// =============================================================================
// @hsi/publishing-engine — public type surface (WorldForge/HSI Phase 19).
//
// PUBLIC INTELLIGENCE PUBLISHING: the publication lifecycle (DRAFT → … →
// PUBLISHED → RETRACTED), governance publishing controls (canPublish /
// publishReview / audit trail), the explainable intelligence REPORT builder, and
// the RETRACTION system. It turns a governed research run into a publishable,
// traceable, trust-aware report — but NOTHING is publishable without human
// approval. No auto-publish. No auto-truth. No black-box content.
//
// PRINCIPLES (binding — identical to Phases 16-18):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every transition/review/retraction carries its
//     reason; every report links back to evidence. NO silent failures.
// =============================================================================

export type { TrustBand } from '@hsi/trust-history';

/** The publication lifecycle state. */
export type PublicationState =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'RETRACTED';

/** An audited record of one publication transition. */
export interface PublicationEvent {
  publicationId: string;
  from: PublicationState;
  to: PublicationState;
  actor: string;
  reason: string;
  at: string;
}

/** A publication — the unit of published intelligence. */
export interface Publication {
  id: string;
  slug: string;
  title: string;
  summary: string;
  state: PublicationState;
  /** The research run this publication is built from (traceability). */
  runId?: string;
  /** 0..100 trust score at publication. */
  trustScore?: number;
  /** 0..1 confidence. */
  confidence?: number;
  evidenceCount: number;
  sourceCount: number;
  categories: string[];
  topics: string[];
  /** Review + governance status surfaced publicly. */
  reviewStatus?: string;
  governanceStatus?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Append-only transition history. */
  events: PublicationEvent[];
}

/** Inputs to createPublication. */
export interface PublicationInput {
  id: string;
  slug: string;
  title: string;
  summary: string;
  runId?: string;
  trustScore?: number;
  confidence?: number;
  evidenceCount?: number;
  sourceCount?: number;
  categories?: string[];
  topics?: string[];
}

/** A mutable subset for updatePublication (DRAFT/UNDER_REVIEW only). */
export interface PublicationPatch {
  title?: string;
  summary?: string;
  trustScore?: number;
  confidence?: number;
  evidenceCount?: number;
  sourceCount?: number;
  categories?: string[];
  topics?: string[];
}

/** Result of a transition (never throws; invalid → ok:false with a reason). */
export type PublicationTransitionResult =
  | { ok: true; publication: Publication; event: PublicationEvent }
  | { ok: false; error: string; reason: string };

export interface PublicationTransitionValidity {
  valid: boolean;
  reason: string;
}

// ---- Governance publishing controls -----------------------------------------

/** Thresholds a publication must clear before it CAN be published. */
export interface PublishThresholds {
  /** Minimum 0..100 trust score. */
  minTrust: number;
  /** Minimum evidence item count. */
  minEvidence: number;
  /** Minimum source count. */
  minSources: number;
}

/** One publish-gate check. */
export interface PublishCheck {
  label: string;
  ok: boolean;
  detail: string;
}

/** The verdict of canPublish — explainable, never a silent gate. */
export interface CanPublishResult {
  canPublish: boolean;
  checks: PublishCheck[];
  /** The failing reasons (empty when canPublish). */
  blockers: string[];
  summary: string;
}

/** A governance publish review decision. */
export interface PublishReview {
  publicationId: string;
  decision: 'approved' | 'rejected';
  reviewer: string;
  reason: string;
  /** The canPublish snapshot at review time. */
  gate: CanPublishResult;
  at: string;
}

// ---- Retraction --------------------------------------------------------------

/** Why a publication was retracted. */
export type RetractionReason =
  | 'evidence_error'
  | 'trust_collapse'
  | 'governance_decision'
  | 'data_quality_issue'
  | 'methodology_issue';

/** A retraction record — retractions remain VISIBLE; history is never deleted. */
export interface RetractionRecord {
  publicationId: string;
  reason: RetractionReason;
  detail: string;
  retractedBy: string;
  /** The state the publication was in before retraction (for reversal context). */
  previousState: PublicationState;
  at: string;
}

// ---- Report builder ----------------------------------------------------------

/** A single section of an intelligence report. */
export interface ReportSection {
  key: string;
  title: string;
  body: string;
  /** Optional enumerated items (evidence refs, factors, …). */
  items?: string[];
  /** Whether this section is backed by ≥1 source reference. */
  sourced: boolean;
}

/** A full, explainable intelligence report. */
export interface IntelligenceReport {
  publicationId: string;
  title: string;
  sections: ReportSection[];
  /** Source references the whole report rests on. */
  sourceRefs: string[];
  generatedAt: string;
}

/** Inputs to buildIntelligenceReport (any field optional; absent → a caveat). */
export interface ReportInput {
  publicationId: string;
  title: string;
  summary?: string;
  evidence?: string[];
  temporal?: string;
  causal?: string;
  counterfactual?: string;
  decision?: string;
  outcome?: string;
  calibration?: string;
  trust?: string;
  governance?: string;
  limitations?: string[];
  provenance?: string[];
  sourceRefs?: string[];
}
