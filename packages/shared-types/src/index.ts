// =============================================================================
// @hsi/shared-types — domain models for the Human Signal Index.
// TypeScript mirror of the database schema (migrations 0001..0004 + Prisma).
// Enums use string-union types where values mirror SQL CHECK constraints.
// =============================================================================

// -----------------------------------------------------------------------------
// Enums / unions
// -----------------------------------------------------------------------------
export type RoleName = 'admin' | 'reviewer' | 'viewer';

export type SourceType =
  | 'website'
  | 'social_page'
  | 'video'
  | 'podcast'
  | 'forum'
  | 'uploaded_file'
  | 'manual_entry';

export type SourceStatus = 'active' | 'paused' | 'archived' | 'unavailable';

export type SignalStatus =
  | 'draft'
  | 'review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'archived';

/** Reviewer workflow states for risk_scores / reviews / public_reports. */
export enum ReviewStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  NeedsMoreEvidence = 'needs_more_evidence',
  Escalated = 'escalated'
}

/** Risk level on the 1-5 scale used across signals and risk_scores. */
export enum RiskLevel {
  Minimal = 1,
  Low = 2,
  Moderate = 3,
  High = 4,
  Severe = 5
}

/** Numeric 1-5 union for fields typed as a bare number with a known range. */
export type RiskLevelValue = 1 | 2 | 3 | 4 | 5;

/** Shared severity scale for alerts and security_events. */
export type SeverityLevel = 'info' | 'low' | 'medium' | 'high' | 'critical';

/** Alert categories (stored in alerts.title in the current schema). */
export type AlertType =
  | 'new_recruitment_link'
  | 'website_copy_change'
  | 'new_social_campaign'
  | 'high_risk_spike'
  | 'self_harm_adjacent'
  | 'violent_coercive'
  | 'vulnerable_targeting'
  | 'misinformation_cluster'
  | 'site_security'
  | 'source_unavailable'
  | 'source_changed';

// -----------------------------------------------------------------------------
// Identity / RBAC
// -----------------------------------------------------------------------------
export interface User {
  id: string;
  email: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
}

// -----------------------------------------------------------------------------
// Sources & signals
// -----------------------------------------------------------------------------
export interface Source {
  id: string;
  source_name: string;
  source_type: SourceType;
  public_url?: string;
  platform?: string;
  status: SourceStatus;
  tags: string[];
  risk_baseline: RiskLevelValue;
  last_checked_at?: string;
  added_by?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  source_id: string;
  title: string;
  summary?: string;
  signal_type: string;
  status: SignalStatus;
  category: string[];
  risk_score: RiskLevelValue;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Evidence & analysis
// -----------------------------------------------------------------------------
export interface EvidenceItem {
  id: string;
  signal_id: string;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
  hash_digest: string;
  captured_at: string;
  chain_of_custody?: string;
  reviewer_notes?: string;
  updated_at: string;
}

export interface Capture {
  id: string;
  source_id: string;
  payload: Record<string, unknown>;
  captured_at: string;
}

export interface Transcript {
  id: string;
  signal_id: string;
  transcript: string;
  created_at: string;
  updated_at: string;
}

export interface Classification {
  id: string;
  signal_id: string;
  category: string;
  /** 0..1 model confidence/score. */
  score: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryTaxonomy {
  id: string;
  slug: string;
  title: string;
  description?: string;
  updated_at: string;
}

export interface RiskScore {
  id: string;
  signal_id: string;
  risk_level: RiskLevelValue;
  quote: string;
  explanation: string;
  /** 0..1 confidence. */
  confidence: number;
  reviewer_status: ReviewStatus;
  recommended_action: string;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  signal_id: string;
  user_id: string;
  status: ReviewStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Alerts & telemetry
// -----------------------------------------------------------------------------
export interface Alert {
  id: string;
  signal_id?: string;
  /** Carries the AlertType in the current schema's `title` column. */
  alert_type: AlertType;
  title: string;
  level: SeverityLevel;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  details?: string;
  level: SeverityLevel;
  created_at: string;
}

// -----------------------------------------------------------------------------
// AI provenance
// -----------------------------------------------------------------------------
export interface AiRun {
  id: string;
  signal_id?: string;
  provider: string;
  prompt: string;
  response: string;
  provenance?: Record<string, unknown>;
  created_at: string;
}

export interface AiTracePassage {
  id: string;
  ai_run_id: string;
  source_text: string;
  generated_text: string;
  /** 0..1 confidence. */
  confidence: number;
}

export interface GeneratedContent {
  id: string;
  signal_id: string;
  content: string;
  content_type: string;
  provenance?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Publication surface
// -----------------------------------------------------------------------------
export interface ReportCitation {
  evidence_id?: string;
  quote?: string;
  source_url?: string;
  note?: string;
}

export interface PublicReport {
  id: string;
  signal_id: string;
  title: string;
  summary: string;
  citations: ReportCitation[] | Record<string, unknown>;
  published: boolean;
  reviewer_status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Audit, monitoring, uploads, collaboration
// -----------------------------------------------------------------------------
export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SourceChange {
  id: string;
  source_id: string;
  change_type: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  source_id?: string;
  signal_id?: string;
  file_name: string;
  file_type: string;
  file_url: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  signal_id?: string;
  user_id?: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  label: string;
  description?: string;
  updated_at: string;
}

// -----------------------------------------------------------------------------
// Shared constants — used by seed scripts and the UI category filters.
// -----------------------------------------------------------------------------
export interface CategorySeed {
  slug: string;
  title: string;
  description: string;
}

/** The 36 HSI rhetoric categories. Single source of truth for seeding. */
export const CATEGORY_TAXONOMY: CategorySeed[] = [
  { slug: 'extinctionism', title: 'Extinctionism', description: 'Narratives advocating the deliberate end of humanity as a goal.' },
  { slug: 'antinatalism', title: 'Antinatalism', description: 'Narratives that frame procreation as ethically harmful and discourage birth.' },
  { slug: 'efilism', title: 'Efilism', description: 'Narratives arguing that the existence of sentient life is itself a harm to be ended.' },
  { slug: 'promortalism', title: 'Promortalism', description: 'Narratives that frame death or non-existence as preferable to continued life.' },
  { slug: 'negative-utilitarianism', title: 'Negative Utilitarianism', description: 'Narratives prioritizing the minimization of suffering above all other values.' },
  { slug: 'suffering-absolutism', title: 'Suffering Absolutism', description: 'Narratives treating the elimination of all suffering as an overriding absolute.' },
  { slug: 'ai-suffering-optimization', title: 'AI Suffering Optimization', description: 'Narratives proposing AI should optimize toward reducing or ending sentient suffering, including by ending life.' },
  { slug: 'ai-savior-narratives', title: 'AI Savior Narratives', description: 'Narratives framing AI as a redemptive force that should govern human decisions.' },
  { slug: 'technocratic-governance', title: 'Technocratic Governance', description: 'Narratives advocating rule by technical elites over democratic processes.' },
  { slug: 'technocratic-moral-control', title: 'Technocratic Moral Control', description: 'Narratives advocating that technical systems should enforce moral outcomes.' },
  { slug: 'anti-human-framing', title: 'Anti-Human Framing', description: 'Narratives portraying humanity as inherently negative or unworthy.' },
  { slug: 'humanity-as-plague', title: 'Humanity-as-Plague Rhetoric', description: 'Narratives depicting humans as a disease or infestation on the planet.' },
  { slug: 'consent-to-birth-framing', title: 'Consent-to-Birth Framing', description: 'Narratives arguing birth is wrong because the unborn cannot consent.' },
  { slug: 'hopelessness-amplification', title: 'Hopelessness Amplification', description: 'Narratives that amplify despair and discourage constructive action.' },
  { slug: 'moral-blackmail', title: 'Moral Blackmail', description: 'Narratives that pressure audiences via guilt or moral coercion.' },
  { slug: 'false-dilemma', title: 'False Dilemma', description: 'Narratives presenting only two extreme options while hiding alternatives.' },
  { slug: 'trauma-exploitation', title: 'Trauma Exploitation', description: 'Narratives leveraging personal or collective trauma for persuasion.' },
  { slug: 'dehumanization', title: 'Dehumanization', description: 'Narratives that strip groups or individuals of human dignity.' },
  { slug: 'reality-denial-rhetoric', title: 'Reality-Denial Rhetoric', description: 'Narratives rejecting consensus reality or verifiable facts.' },
  { slug: 'existence-is-illusion', title: 'Existence-is-Illusion Rhetoric', description: 'Narratives claiming existence or the self is an illusion to justify harm.' },
  { slug: 'pain-is-not-real', title: 'Pain-is-Not-Real Rhetoric', description: 'Narratives denying the reality of suffering to dismiss harm.' },
  { slug: 'historical-trauma-erasure', title: 'Historical Trauma Erasure', description: 'Narratives that erase or minimize documented historical trauma.' },
  { slug: 'population-reduction', title: 'Population-Reduction Rhetoric', description: 'Narratives advocating large-scale reduction of human population.' },
  { slug: 'recruitment-language', title: 'Recruitment Language', description: 'Language designed to draw new members into a movement.' },
  { slug: 'protest-activism-language', title: 'Protest / Activism Language', description: 'Mobilization language framing collective action or protest.' },
  { slug: 'vulnerable-audience-targeting', title: 'Vulnerable-Audience Targeting', description: 'Messaging aimed at emotionally or psychologically vulnerable audiences.' },
  { slug: 'misinformation', title: 'Misinformation', description: 'Inaccurate claims spread without necessarily intending to deceive.' },
  { slug: 'disinformation', title: 'Disinformation', description: 'Deliberately false claims spread with intent to deceive.' },
  { slug: 'propaganda', title: 'Propaganda', description: 'Systematically biased messaging to promote a cause or worldview.' },
  { slug: 'religious-narratives', title: 'Religious Narratives', description: 'Framing that uses religious or spiritual concepts.' },
  { slug: 'political-narratives', title: 'Political Narratives', description: 'Framing organized around political identity or power.' },
  { slug: 'economic-narratives', title: 'Economic Narratives', description: 'Framing organized around economic conditions or grievances.' },
  { slug: 'civilizational-narratives', title: 'Civilizational Narratives', description: 'Framing about the trajectory or worth of civilization.' },
  { slug: 'technology-narratives', title: 'Technology Narratives', description: 'Framing centered on technology as cause or solution.' },
  { slug: 'collapse-narratives', title: 'Collapse Narratives', description: 'Framing predicting inevitable societal or ecological collapse.' },
  { slug: 'doom-narratives', title: 'Doom Narratives', description: 'Framing centered on inevitable catastrophic outcomes.' }
];

/** The base HSI roles. Single source of truth for seeding. */
export const HSI_ROLES: { name: RoleName; description: string }[] = [
  { name: 'admin', description: 'Platform administrator with full access' },
  { name: 'reviewer', description: 'Reviewer with signal evaluation and approval permissions' },
  { name: 'viewer', description: 'Read-only user limited to approved, published reports' }
];

// -----------------------------------------------------------------------------
// Backward-compatible aliases (legacy *Record names).
// -----------------------------------------------------------------------------
export type SourceRecord = Source;
export type SignalRecord = Signal;
export type ClassificationRecord = Classification;
export type RiskScoreRecord = RiskScore;

// =============================================================================
// WorldForge (Phase 2 — causal world-simulation subsystem)
// -----------------------------------------------------------------------------
// TypeScript mirror of the WorldForge persistence tables (migration 0005).
// These record types model the PERSISTED rows; the rich engine objects
// (WorldState, SimulationGraph, WorldDiff, Counterfactual, TimelineEvent,
// WorldEvaluation, Provenance, ...) live in the engine packages and are stored
// here as JSON payloads (typed below as `unknown`/`Record<string, unknown>` so
// shared-types stays decoupled from the engine internals).
// =============================================================================

/**
 * Universe model for a WorldForge world. Mirrors the engine's UniverseType
 * and the worlds.universe_type / simulations.universe_type CHECK domain.
 */
export type WorldForgeUniverseType =
  | 'standard-physics'
  | 'alternative-constants'
  | 'high-gravity'
  | 'low-entropy'
  | 'exotic-matter'
  | 'user-defined';

/**
 * Scientific Confidence ladder for a computed node (Provenance.scientificConfidence.tier).
 * Mirrors simulation_provenance.scientific_tier.
 */
export type ScientificConfidenceTier =
  | 'known-science'
  | 'plausible-science'
  | 'speculative'
  | 'fictional'
  | 'violates-known-physics';

/** Kind of generated timeline. Mirrors world_timelines.kind. */
export type TimelineKind = 'evolution' | 'civilization' | 'planetary' | 'stellar';

/** Lifecycle status of a simulation instance. */
export type SimulationStatus = 'active' | 'archived' | 'draft';

/** A reusable world definition. Mirrors the `worlds` table. */
export interface WorldRecord {
  id: string;
  name: string;
  description?: string;
  universe_type: WorldForgeUniverseType;
  /** Canonical WorldState JSON written by the engine. */
  base_state: Record<string, unknown>;
  created_by?: string;
  is_public: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** A live simulation instance derived from a world. Mirrors the `simulations` table. */
export interface SimulationRecord {
  id: string;
  world_id: string;
  name: string;
  universe_type: WorldForgeUniverseType;
  /** Latest recomputed WorldState JSON. */
  current_state: Record<string, unknown>;
  latest_version: number;
  status: SimulationStatus | string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** An immutable WorldVersion snapshot. Mirrors the `simulation_versions` table. */
export interface SimulationVersionRecord {
  id: string;
  simulation_id: string;
  version: number;
  label?: string;
  /** Frozen WorldState snapshot. */
  world_state: Record<string, unknown>;
  /** WorldEvaluation at this version. */
  evaluation?: Record<string, unknown>;
  parent_version?: number;
  created_by?: string;
  created_at: string;
}

/** A named set of tunable parameter changes. Mirrors the `scenarios` table. */
export interface ScenarioRecord {
  id: string;
  simulation_id: string;
  name: string;
  description?: string;
  /** The tunable parameter changes. */
  parameters: Record<string, unknown>;
  /** Recomputed result summary. */
  result_summary?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** A counterfactual experiment + its propagated impact. Mirrors the `counterfactuals` table. */
export interface CounterfactualRecord {
  id: string;
  simulation_id: string;
  name: string;
  /** The counterfactual modification (Counterfactual.modification). */
  modification: Record<string, unknown>;
  /** Propagated impact chain across the dependency graph (CounterfactualResult). */
  impact_chain?: Record<string, unknown>;
  explanation?: string;
  /** 0..1 confidence. */
  confidence?: number;
  affected_nodes?: number;
  base_version?: number;
  created_by?: string;
  created_at: string;
}

/** A generated TimelineEvent sequence. Mirrors the `world_timelines` table. */
export interface WorldTimelineRecord {
  id: string;
  simulation_id: string;
  kind: TimelineKind;
  span_years?: number;
  /** TimelineEvent[] payload. */
  events: Record<string, unknown>[];
  created_by?: string;
  created_at: string;
}

/**
 * Per-node provenance/traceability for a computed output.
 * Mirrors the `simulation_provenance` table and the engine's
 * Provenance {source, reason, dependsOn[], confidence, scientificConfidence}.
 */
export interface SimulationProvenanceRecord {
  id: string;
  simulation_id: string;
  node_id?: string;
  source?: string;
  reason?: string;
  depends_on: string[];
  /** 0..1 confidence. */
  confidence?: number;
  scientific_tier?: ScientificConfidenceTier;
  created_at: string;
}

// =============================================================================
// Research (Phase 3 — multi-agent research layer)
// -----------------------------------------------------------------------------
// TypeScript mirror of the research persistence tables (migration 0007). These
// record types model the PERSISTED rows; the rich engine objects (AgentOutput,
// ConsensusReport, Dispute, Citation, SimulationBlueprint, ...) live in the
// '@hsi/research-agents' package and are stored here as JSON payloads (typed as
// `unknown` / `Record<string, unknown>` so shared-types stays decoupled from the
// engine internals).
// =============================================================================

/** The 11 research agent domains (9 domain agents + skeptic + consensus). */
export type ResearchAgentDomain =
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

/** The 6 traceability categories tagged on every research claim/citation. */
export type ProvenanceSource =
  | 'user-input'
  | 'prior-agent'
  | 'known-science'
  | 'model-inference'
  | 'speculative-assumption'
  | 'unsupported-generation';

/** Lifecycle status of a research run. Mirrors research_runs.status. */
export type ResearchRunStatus = 'pending' | 'running' | 'complete' | 'failed';

/** A full multi-agent research run. Mirrors the `research_runs` table. */
export interface ResearchRunRecord {
  id: string;
  created_by?: string;
  title?: string;
  /** The raw user concept text. */
  concept_text: string;
  /** Parsed ConceptSignals JSON. */
  concept_signals?: Record<string, unknown>;
  status: ResearchRunStatus | string;
  /** 0..100 aggregate consensus confidence. */
  overall_confidence?: number;
  /** 0..100 inter-agent agreement. */
  agreement_score?: number;
  /** The synthesized SimulationBlueprint JSON. */
  blueprint?: Record<string, unknown>;
  /** The world generated from this run's blueprint, if any. */
  world_id?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/** One agent's output within a run. Mirrors the `research_agent_outputs` table. */
export interface ResearchAgentOutputRecord {
  id: string;
  run_id: string;
  domain: ResearchAgentDomain | string;
  title?: string;
  /** Full AgentOutput / ConsensusReport JSON. */
  output: Record<string, unknown>;
  confidence_score?: number;
  uncertainty_score?: number;
  created_at: string;
}

/** The consensus synthesis for a run. Mirrors the `research_consensus_reports` table. */
export interface ResearchConsensusReportRecord {
  id: string;
  run_id: string;
  /** Full ConsensusReport JSON. */
  report: Record<string, unknown>;
  overall_confidence?: number;
  agreement_score?: number;
  /** Claims per ScientificConfidenceTier. */
  classification_breakdown?: Record<string, unknown>;
  created_at: string;
}

/** A flattened agent citation. Mirrors the `research_citations` table. */
export interface ResearchCitationRecord {
  id: string;
  run_id: string;
  agent_domain?: string;
  label: string;
  kind: string;
  note?: string;
  created_at: string;
}

/** A skeptic dispute raised against a claim/domain. Mirrors the `research_disputes` table. */
export interface ResearchDisputeRecord {
  id: string;
  run_id: string;
  raised_by: string;
  target_domain?: string;
  target_claim_id?: string;
  severity?: 'low' | 'medium' | 'high' | string;
  challenge: string;
  resolution?: string;
  status: 'open' | 'mitigated' | 'accepted' | string;
  created_at: string;
}

/** A research run plus all of its persisted child rows (the full load shape). */
export interface ResearchRunBundle {
  run: ResearchRunRecord;
  outputs: ResearchAgentOutputRecord[];
  consensus: ResearchConsensusReportRecord | null;
  disputes: ResearchDisputeRecord[];
  citations: ResearchCitationRecord[];
}

// =============================================================================
// Evidence (Phase 4 — Evidence & Citation Engine)
// -----------------------------------------------------------------------------
// TypeScript mirror of the evidence persistence tables (migration 0008). These
// record types model the PERSISTED rows. The rich engine objects (EvidenceResult,
// ClaimEvidence, EvidenceCoverage, ...) live in the '@hsi/evidence-engine' package;
// here we mirror only the serializable, stored shapes so shared-types stays
// decoupled from the engine internals (jsonb payloads typed as `unknown` /
// `Record<string, unknown>` / `string[]`).
// =============================================================================

/** How a source relates to a claim. Mirrors claim_evidence_links.support_type. */
export type EvidenceSupportType =
  | 'supports'
  | 'contradicts'
  | 'background'
  | 'unclear';

/** Bibliographic class of an evidence source. Mirrors evidence_sources.publication_type. */
export type EvidencePublicationType =
  | 'peer-reviewed'
  | 'preprint'
  | 'review'
  | 'encyclopedia'
  | 'web'
  | 'dataset'
  | 'unknown';

/** Coarse reliability bucket for a citation (engine's ReliabilityTier). */
export type EvidenceReliabilityTier =
  | 'high'
  | 'medium'
  | 'low'
  | 'unsupported'
  | 'invalid';

/** Lifecycle status of a human evidence review. Mirrors evidence_reviews.status. */
export type EvidenceReviewStatus =
  | 'pending'
  | 'validated'
  | 'rejected'
  | 'needs_more';

/**
 * How a run's evidence was gathered, surfaced on research_runs.evidence_status.
 * 'none' until evidence has been gathered for the run.
 */
export type RunEvidenceStatus = 'none' | 'fixture' | 'live' | 'mixed';

/** A shared, de-duplicated citation. Mirrors the `evidence_sources` table. */
export interface EvidenceSourceRecord {
  id: string;
  source_type?: string;
  title: string;
  /** string[] of author names (jsonb). */
  authors?: string[];
  year?: number;
  abstract?: string;
  url?: string;
  /** Normalized DOI (no scheme, lowercased). */
  doi?: string;
  arxiv_id?: string;
  pubmed_id?: string;
  semantic_scholar_id?: string;
  /** Provider name ('arXiv','Crossref','fixture',...). */
  source_name?: string;
  publication_type?: EvidencePublicationType | string;
  /** 0..1 reliability. */
  reliability_score?: number;
  is_fixture: boolean;
  /** EvidenceResult.raw + extras (jsonb). */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A per-run claim->source link. Mirrors the `claim_evidence_links` table. */
export interface ClaimEvidenceLinkRecord {
  id: string;
  research_run_id: string;
  agent_output_id?: string;
  claim_id?: string;
  evidence_source_id: string;
  support_type?: EvidenceSupportType | string;
  /** 0..1 relevance. */
  relevance_score?: number;
  /** 0..1 confidence. */
  confidence?: number;
  rationale?: string;
  created_by?: string;
  created_at: string;
}

/** A human review verdict on an evidence source. Mirrors the `evidence_reviews` table. */
export interface EvidenceReviewRecord {
  id: string;
  evidence_source_id: string;
  reviewed_by?: string;
  status?: EvidenceReviewStatus | string;
  notes?: string;
  created_at: string;
}

/**
 * Serializable aggregate coverage for a run — mirrors the engine's EvidenceCoverage
 * and the jsonb stored in research_runs.evidence_coverage.
 */
export interface EvidenceCoverageSummary {
  totalClaims: number;
  supported: number;
  contradicted: number;
  background: number;
  unsupported: number;
  /** 0..100 — fraction of claims with supporting/contradicting evidence. */
  coverageScore: number;
  /** Count of results contributed per source name. */
  bySource: Record<string, number>;
  /** Whether the evidence came from fixtures, the network, or both. */
  mode: 'fixture' | 'live' | 'mixed';
  // --- Phase 5: evidence-weighted consensus (optional; absent on Phase 4 rows). ---
  /** 0..100 — confidence after weighting research confidence by evidence. */
  evidenceWeightedConfidence?: number;
  /** 0..100 — the original agent/consensus confidence the weighting started from. */
  researchConfidence?: number;
  /** 0..1 — supported / totalClaims. */
  supportRatio?: number;
  /** 0..1 — contradicted / totalClaims. */
  contradictionRatio?: number;
  /** 0..1 — unsupported / totalClaims. */
  unsupportedRatio?: number;
  /** Human-readable "why the score changed" reasons (headline first). */
  explanation?: string[];
  /** Per-claim reliability verdicts (tier-capped). */
  claimReliabilities?: ClaimReliabilitySummary[];
}

/** A run's full evidence load: its sources, links, and aggregate coverage. */
export interface RunEvidenceBundle {
  sources: EvidenceSourceRecord[];
  links: ClaimEvidenceLinkRecord[];
  coverage: EvidenceCoverageSummary;
}

// =============================================================================
// Evidence Hardening (Phase 5 — Live Retrieval & Evidence Hardening)
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 5 persistence (migration 0009) + the
// aggregate/graph shapes the dashboard renders. The rich engine objects
// (ProviderHealth, EvidenceWeightedResult, ClaimReliability, ...) live in
// '@hsi/evidence-engine' / '@hsi/research-agents'; here we mirror only the
// stored/serializable shapes so shared-types stays decoupled from the engines.
// =============================================================================

/** Operational status of a retrieval provider. Mirrors the engine ProviderStatus. */
export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'OFFLINE';

/** A persisted provider-health snapshot. Mirrors the `provider_health` table. */
export interface ProviderHealthRecord {
  id: string;
  provider: string;
  enabled: boolean;
  available: boolean;
  last_success?: string;
  last_failure?: string;
  latency_ms?: number;
  error_count: number;
  success_count: number;
  status: ProviderHealthStatus;
  updated_at: string;
  created_at: string;
}

/** A persisted retrieval-cache entry. Mirrors the `evidence_cache` table. */
export interface EvidenceCacheRecord {
  id: string;
  provider: string;
  query_hash: string;
  query_text?: string;
  /** Cached EvidenceResult[] union (jsonb). */
  response_json?: unknown;
  created_at: string;
  expires_at: string;
}

/** A per-claim reliability verdict (tier-capped). Mirrors engine ClaimReliability. */
export interface ClaimReliabilitySummary {
  claimId: string;
  tier: string;
  /** 0..1 — blended + coverage-modulated confidence (before tier ceiling). */
  finalConfidence: number;
  /** 0..100 — finalConfidence*100, capped by the tier ceiling. */
  reliabilityScore: number;
  coverage: 'supported' | 'contradicted' | 'background' | 'unsupported';
  rationale?: string;
}

/**
 * One row of the reviewer queue: an evidence source, its latest review verdict
 * (if any), and the aggregate support/contradiction counts across all runs that
 * link to it. `status` is the effective review status ('pending' until reviewed).
 */
export interface EvidenceReviewQueueItem {
  source: EvidenceSourceRecord;
  latestReview?: EvidenceReviewRecord;
  status: 'pending' | 'validated' | 'rejected' | 'needs_more';
  /** Distinct research_run ids that link this source. */
  linkedRunIds: string[];
  /** Count of 'supports' links to this source. */
  supportCount: number;
  /** Count of 'contradicts' links to this source. */
  contradictionCount: number;
}

/** Cross-run evidence intelligence aggregate for the dashboard. */
export interface EvidenceIntelligence {
  totalRuns: number;
  avgCoverageScore: number;
  avgSupportRatio: number;
  avgContradictionRatio: number;
  avgUnsupportedRatio: number;
  totalSupported: number;
  totalContradicted: number;
  totalBackground: number;
  totalUnsupported: number;
  providerHealth: ProviderHealthRecord[];
  coverageTimeline: {
    runId: string;
    label: string;
    date: string;
    coverageScore: number;
    evidenceWeightedConfidence?: number;
  }[];
  /** evidence_sources.publication_type -> count. */
  sourceTypeBreakdown: Record<string, number>;
}

/** A node in the claim<->evidence graph (a claim or a source). */
export interface ClaimEvidenceGraphNode {
  id: string;
  kind: 'claim' | 'source';
  label: string;
  tier?: string;
  supportType?: string;
  meta?: Record<string, unknown>;
}

/** An edge linking a claim node to a source node. */
export interface ClaimEvidenceGraphEdge {
  id: string;
  source: string;
  target: string;
  supportType: 'supports' | 'contradicts' | 'background' | 'unclear';
  confidence?: number;
}

/** The claim<->evidence graph for one run. */
export interface ClaimEvidenceGraph {
  nodes: ClaimEvidenceGraphNode[];
  edges: ClaimEvidenceGraphEdge[];
}

// =============================================================================
// Review & Curation — Phase 6 (Human Review & Curation)
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 6 persistence (migration 0010): the review
// queue + assignments + decisions, publication records/versions, threaded review
// comments, reviewer-trust aggregates, and per-user notifications — plus the
// view-model shapes the curation UI renders. The 5-role ladder is mirrored by
// `AppRole`. Timestamps are ISO strings; uuid columns are strings.
// =============================================================================

/**
 * Entity kinds that can enter the review/curation pipeline.
 * Extended in Phase 7 to include HSIN `signal` and `source` (additive).
 */
export type ReviewEntityType =
  | 'research_run'
  | 'consensus_report'
  | 'evidence_summary'
  | 'worldforge_report'
  | 'evidence_source'
  | 'publication'
  | 'signal'
  | 'source';

/** Workflow status of a review queue entry. Mirrors review_queues.status. */
export type ReviewQueueStatus =
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'needs_evidence'
  | 'escalated';

/** Reviewer worklist priority. Mirrors review_queues.priority. */
export type ReviewPriority = 'low' | 'medium' | 'high' | 'urgent';

/** A reviewer verdict. Mirrors review_decisions.decision. */
export type ReviewDecisionType = 'APPROVE' | 'REJECT' | 'NEEDS_EVIDENCE' | 'ESCALATE';

/** Publication visibility tier. Mirrors publication_records.visibility. */
export type PublicationVisibility = 'PRIVATE' | 'TEAM' | 'PUBLIC';

/** The 5-role privilege ladder (ascending). Mirrors public.roles + has_role(). */
export type AppRole = 'viewer' | 'researcher' | 'reviewer' | 'curator' | 'admin';

/** Notification kinds emitted by the governance pipeline. Mirrors notifications.type. */
export type NotificationType =
  | 'review_assigned'
  | 'review_completed'
  | 'publication_approved'
  | 'escalation_created'
  | 'evidence_rejected'
  | 'comment_mention'
  | 'review_requested';

/** A review queue entry. Mirrors the `review_queues` table. */
export interface ReviewQueueRecord {
  id: string;
  entity_type: ReviewEntityType | string;
  entity_id: string;
  status: ReviewQueueStatus;
  priority: ReviewPriority;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** An assignment-history row for a queue entry. Mirrors the `review_assignments` table. */
export interface ReviewAssignmentRecord {
  id: string;
  review_queue_id: string;
  reviewer_id?: string;
  assigned_at: string;
  completed_at?: string;
}

/** An immutable reviewer verdict. Mirrors the `review_decisions` table. */
export interface ReviewDecisionRecord {
  id: string;
  review_queue_id: string;
  reviewer_id?: string;
  decision: ReviewDecisionType;
  notes?: string;
  created_at: string;
}

/** A published entity record. Mirrors the `publication_records` table. */
export interface PublicationRecord {
  id: string;
  entity_type: ReviewEntityType | string;
  entity_id: string;
  published_by?: string;
  published_at: string;
  visibility: PublicationVisibility;
  status?: string;
  latest_version?: number;
  created_at: string;
  updated_at: string;
}

/** An immutable publication snapshot. Mirrors the `publication_versions` table. */
export interface PublicationVersionRecord {
  id: string;
  publication_record_id: string;
  version_number: number;
  /** Frozen public-facing payload (jsonb). */
  snapshot_json: Record<string, unknown>;
  created_by?: string;
  created_at: string;
}

/** A threaded review comment with @mentions. Mirrors the `review_comments` table. */
export interface ReviewCommentRecord {
  id: string;
  entity_type: ReviewEntityType | string;
  entity_id: string;
  user_id?: string;
  comment: string;
  /** Parent comment id when this is a reply (threading). */
  parent_id?: string;
  /** Mentioned user ids (uuid[]). */
  mentions: string[];
  created_at: string;
}

/** A per-reviewer trust aggregate. Mirrors the `reviewer_trust` table. */
export interface ReviewerTrustRecord {
  id: string;
  reviewer_id: string;
  approved_count: number;
  reversed_count: number;
  review_count: number;
  /** 0..1 trust score (default 0.5). */
  trust_score: number;
  updated_at: string;
  created_at: string;
}

/** A per-user notification. Mirrors the `notifications` table. */
export interface NotificationRecord {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  entity_type?: ReviewEntityType | string;
  entity_id?: string;
  read: boolean;
  created_at: string;
}

/**
 * One row of the curation queue list: the queue entry plus light denormalized
 * context (assigned reviewer email, decision count, latest decision, and a small
 * summary of the underlying entity) the UI renders without extra round-trips.
 */
export interface ReviewQueueItem {
  queue: ReviewQueueRecord;
  assignedReviewerEmail?: string;
  decisionsCount: number;
  latestDecision?: ReviewDecisionRecord;
  entitySummary?: Record<string, unknown>;
}

/** The full detail view for a single queued item: queue + all related rows. */
export interface ReviewItemDetail {
  queue: ReviewQueueRecord;
  assignments: ReviewAssignmentRecord[];
  decisions: ReviewDecisionRecord[];
  comments: ReviewCommentRecord[];
  entitySummary?: Record<string, unknown>;
}

/** Aggregate data backing the curation dashboard. */
export interface CurationDashboardData {
  pendingPublications: PublicationRecord[];
  highPriorityReviews: ReviewQueueItem[];
  escalations: ReviewQueueItem[];
  contradictionRuns: Record<string, unknown>[];
  lowCoverageRuns: Record<string, unknown>[];
}

/**
 * A draft of a public-facing report assembled for curator review before
 * publication. Aggregates the executive summary, key claims, evidence summary,
 * support ratio, contradictions, consensus, reviewer notes, and metadata.
 */
export interface PublicReportDraft {
  entityType: ReviewEntityType;
  entityId: string;
  executiveSummary: string;
  keyClaims: unknown[];
  evidenceSummary: Record<string, unknown>;
  supportRatio: number;
  contradictions: unknown[];
  consensus: Record<string, unknown>;
  reviewerNotes: string[];
  metadata: Record<string, unknown>;
}

// =============================================================================
// Signal Intelligence Network — Phase 7 (Human Signal Intelligence Network)
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 7 persistence (migration 0011): the HSIN
// monitored sources + groups, watchlists, captured signals + versions/events/tags/
// reviews, alerts, source-health, capture-jobs, and narrative-drift — plus the
// view-model shapes the intelligence dashboard renders.
//
// NAMING: the underlying tables use the `hsin_` prefix to preserve the Phase-1
// `sources`/`signals` tables (see migration 0011 header). These record types mirror
// the prefixed tables; their TS names carry the `Hsin` prefix to mirror that and to
// avoid colliding with the Phase-1 `Source`/`Signal`/`SourceRecord`/`SignalRecord`.
// Timestamps are ISO strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/** Kind of monitored source. Mirrors hsin_sources.source_type. */
export type HsinSourceType =
  | 'website'
  | 'rss'
  | 'youtube'
  | 'tiktok'
  | 'podcast'
  | 'forum'
  | 'document'
  | 'manual';

/** Lifecycle status of a monitored source. Mirrors hsin_sources.status. */
export type HsinSourceStatus = 'active' | 'paused' | 'disabled' | 'error';

/** Kind of captured signal. Mirrors hsin_signals.signal_type. */
export type HsinSignalType =
  | 'article'
  | 'video'
  | 'podcast_episode'
  | 'forum_post'
  | 'social_post'
  | 'document'
  | 'manual_submission'
  | 'rss_item';

/**
 * Signal category. The 16 well-known categories (incl 'other'), but typed to also
 * allow custom strings (`string & {}`) so callers keep IDE autocompletion for the
 * known values while still accepting arbitrary engine-emitted categories.
 * Mirrors hsin_signals.signal_category (a free-form text column).
 */
export type HsinSignalCategory =
  | 'ideology'
  | 'recruitment'
  | 'radicalization'
  | 'misinformation'
  | 'disinformation'
  | 'propaganda'
  | 'extremism'
  | 'coordination'
  | 'mobilization'
  | 'narrative_shift'
  | 'self_harm'
  | 'violence'
  | 'targeting'
  | 'financing'
  | 'technology'
  | 'other'
  | (string & {});

/** Triage workflow status of a captured signal. Mirrors hsin_signals.status. */
export type HsinSignalStatus =
  | 'new'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'needs_research'
  | 'published';

/** Trigger classification for an alert. Mirrors hsin_signal_alerts.alert_type. */
export type HsinAlertType =
  | 'new_signal'
  | 'source_changed'
  | 'narrative_shift'
  | 'watchlist_match'
  | 'high_risk_signal'
  | 'review_escalation'
  | 'research_created'
  | 'publication_created';

/** Alert/watchlist severity scale. Mirrors hsin_signal_alerts.severity / hsin_watchlists.severity. */
export type HsinAlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Triage status of an alert. Mirrors hsin_signal_alerts.status. */
export type HsinAlertStatus = 'open' | 'acknowledged' | 'escalated' | 'resolved';

/** A reviewer verdict on a captured signal. Mirrors hsin_signal_reviews.decision. */
export type HsinSignalDecision = 'APPROVE' | 'REJECT' | 'NEEDS_RESEARCH' | 'ESCALATE';

/** A monitored signal source. Mirrors the `hsin_sources` table. */
export interface HsinSourceRecord {
  id: string;
  name: string;
  description?: string;
  source_type: HsinSourceType | string;
  platform?: string;
  homepage_url?: string;
  rss_url?: string;
  status: HsinSourceStatus;
  /** 1..5 baseline risk level. */
  risk_level?: number;
  monitoring_enabled?: boolean;
  last_checked_at?: string;
  last_changed_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** A named grouping of sources. Mirrors the `hsin_source_groups` table. */
export interface HsinSourceGroupRecord {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  created_at: string;
}

/** A source<->group membership. Mirrors the `hsin_source_group_members` table. */
export interface HsinSourceGroupMemberRecord {
  id: string;
  group_id: string;
  source_id: string;
}

/** A watchlist of terms at a severity. Mirrors the `hsin_watchlists` table. */
export interface HsinWatchlistRecord {
  id: string;
  name: string;
  description?: string;
  severity?: HsinAlertSeverity;
  terms: string[];
  created_by?: string;
  created_at: string;
}

/** A watchlist<->source scoping. Mirrors the `hsin_watchlist_sources` table. */
export interface HsinWatchlistSourceRecord {
  id: string;
  watchlist_id: string;
  source_id: string;
}

/** A captured signal. Mirrors the `hsin_signals` table. */
export interface HsinSignalRecord {
  id: string;
  source_id?: string;
  title: string;
  summary?: string;
  raw_content?: string;
  content_hash?: string;
  signal_type?: HsinSignalType | string;
  signal_category?: HsinSignalCategory;
  /** 0..1 capture/classification confidence. */
  confidence?: number;
  status: HsinSignalStatus;
  captured_at?: string;
  created_by?: string;
  created_at: string;
}

/** An immutable signal snapshot. Mirrors the `hsin_signal_versions` table. */
export interface HsinSignalVersionRecord {
  id: string;
  signal_id: string;
  version_number: number;
  /** Frozen captured payload (jsonb). */
  snapshot_json: Record<string, unknown>;
  created_at: string;
}

/** An append-only signal event. Mirrors the `hsin_signal_events` table. */
export interface HsinSignalEventRecord {
  id: string;
  signal_id: string;
  event_type: string;
  /** Arbitrary structured context (jsonb). */
  event_payload?: Record<string, unknown>;
  created_at: string;
}

/** A free-form tag on a signal. Mirrors the `hsin_signal_tags` table. */
export interface HsinSignalTagRecord {
  id: string;
  signal_id: string;
  tag: string;
}

/** A reviewer verdict on a captured signal. Mirrors the `hsin_signal_reviews` table. */
export interface HsinSignalReviewRecord {
  id: string;
  signal_id: string;
  reviewer_id?: string;
  decision?: HsinSignalDecision;
  notes?: string;
  created_at: string;
}

/** An alert raised by the network. Mirrors the `hsin_signal_alerts` table. */
export interface HsinSignalAlertRecord {
  id: string;
  signal_id?: string;
  source_id?: string;
  alert_type: HsinAlertType;
  severity: HsinAlertSeverity;
  title?: string;
  explanation?: string;
  status: HsinAlertStatus;
  created_at: string;
}

/** A point-in-time source health observation. Mirrors the `hsin_source_health` table. */
export interface HsinSourceHealthRecord {
  id: string;
  source_id: string;
  status?: string;
  /** Response time (ms). */
  response_time?: number;
  last_success?: string;
  last_failure?: string;
  failure_count?: number;
  created_at: string;
}

/** A capture run against a source. Mirrors the `hsin_capture_jobs` table. */
export interface HsinCaptureJobRecord {
  id: string;
  source_id?: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  created_at: string;
}

/** A detected narrative-drift event. Mirrors the `hsin_narrative_drift` table. */
export interface HsinNarrativeDriftRecord {
  id: string;
  source_id?: string;
  signal_id?: string;
  before_text?: string;
  after_text?: string;
  explanation?: string;
  /** 0..1 confidence in the drift detection. */
  confidence?: number;
  /** Magnitude of the detected drift. */
  drift_score?: number;
  detected_at?: string;
  created_at: string;
}

/** A source plus its denormalized stats for the sources list/detail view. */
export interface SourceWithStats {
  source: HsinSourceRecord;
  health?: HsinSourceHealthRecord;
  signalCount: number;
  alertCount: number;
  /** Names of watchlists this source is scoped to. */
  watchlists?: string[];
}

/** A captured signal plus its full surrounding context for the signal detail view. */
export interface SignalWithContext {
  signal: HsinSignalRecord;
  source?: HsinSourceRecord;
  versionCount: number;
  tags: string[];
  alerts: HsinSignalAlertRecord[];
  reviewStatus?: string;
  /** research_runs.id values spawned from this signal (origin_signal_id). */
  researchRunIds: string[];
}

/** Aggregate data backing the intelligence overview dashboard. */
export interface IntelligenceOverview {
  totalSources: number;
  activeSources: number;
  signalsCaptured: number;
  signalsReviewed: number;
  watchlistMatches: number;
  narrativeShifts: number;
  researchRunsGenerated: number;
  publicationsGenerated: number;
  /** hsin_source_health.status -> count. */
  sourceHealthSummary: Record<string, number>;
  /** Signals captured per day. */
  signalVelocity: { date: string; count: number }[];
  /** Alerts raised per day. */
  alertActivity: { date: string; count: number }[];
}

// =============================================================================
// Scheduler, Queue & Narrative Graph — Phase 8
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 8 persistence (migration 0012): the durable
// job queue + per-attempt log, cron-style scheduler rules, capture-dedupe
// bookkeeping, the entity/narrative knowledge graph (entities, signal<->entity
// links, narratives, signal<->narrative links, narrative edges), triage rules,
// SLA policies, and provider accounts + rate limits — plus the view-model shapes
// the operations console and narrative-graph UI render.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phase 7);
// their TS record names carry the `Hsin` prefix to mirror that. Timestamps are ISO
// strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/** Lifecycle status of a queued job. Mirrors hsin_job_queue.status. */
export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled';

/** Kind of entity node in the intelligence graph. Mirrors hsin_entities.entity_type. */
export type HsinEntityType =
  | 'person'
  | 'organization'
  | 'movement'
  | 'ideology'
  | 'topic'
  | 'place'
  | 'platform'
  | 'publication'
  | 'unknown';

/** Kind of directed edge between two narratives. Mirrors hsin_narrative_edges.edge_type. */
export type NarrativeEdgeType =
  | 'related_to'
  | 'contradicts'
  | 'amplifies'
  | 'evolves_into'
  | 'derived_from'
  | 'co_occurs_with';

/**
 * Kind of action a triage rule can take. Typed as a known union plus `string & {}`
 * so callers keep autocompletion while accepting arbitrary engine-emitted actions.
 * Carried inside hsin_triage_rules.actions_json.
 */
export type TriageActionType =
  | 'tag'
  | 'set_status'
  | 'set_priority'
  | 'assign'
  | 'route'
  | 'raise_alert'
  | 'escalate'
  | 'enqueue_research'
  | 'suppress'
  | (string & {});

/** SLA severity scale. Mirrors hsin_sla_policies.severity. */
export type SlaSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** A durable unit of work for the background worker. Mirrors the `hsin_job_queue` table. */
export interface HsinJobQueueRecord {
  id: string;
  job_type: string;
  status: JobStatus;
  /** Worklist priority (lower = sooner by convention). */
  priority: number;
  source_id?: string;
  /** Arbitrary job input (jsonb). */
  payload_json?: Record<string, unknown>;
  scheduled_for: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

/** One execution attempt of a queued job. Mirrors the `hsin_job_attempts` table. */
export interface HsinJobAttemptRecord {
  id: string;
  job_id: string;
  attempt_number: number;
  started_at?: string;
  finished_at?: string;
  status?: string;
  error_message?: string;
  /** Arbitrary structured attempt log (jsonb). */
  log_json?: Record<string, unknown>;
  created_at: string;
}

/** A cron-style scheduler rule. Mirrors the `hsin_scheduler_rules` table. */
export interface HsinSchedulerRuleRecord {
  id: string;
  source_id?: string;
  job_type: string;
  cron_expression: string;
  enabled: boolean;
  next_run_at?: string;
  last_run_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** Capture de-dup bookkeeping per source. Mirrors the `hsin_capture_dedupes` table. */
export interface HsinCaptureDedupeRecord {
  id: string;
  source_id?: string;
  content_hash: string;
  canonical_url?: string;
  first_seen_at?: string;
  last_seen_at?: string;
  signal_id?: string;
  created_at: string;
}

/** An entity node in the shared intelligence graph. Mirrors the `hsin_entities` table. */
export interface HsinEntityRecord {
  id: string;
  name: string;
  entity_type: HsinEntityType;
  description?: string;
  /** Arbitrary structured metadata (jsonb). */
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** A signal<->entity link with extraction confidence. Mirrors the `hsin_signal_entities` table. */
export interface HsinSignalEntityRecord {
  id: string;
  signal_id: string;
  entity_id: string;
  /** 0..1 extraction confidence. */
  confidence?: number;
  evidence_text?: string;
  created_at: string;
}

/** A tracked narrative in the graph. Mirrors the `hsin_narratives` table. */
export interface HsinNarrativeRecord {
  id: string;
  name: string;
  description?: string;
  category?: string;
  /** 1..5 baseline risk level. */
  risk_level?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** A signal<->narrative link with confidence. Mirrors the `hsin_signal_narratives` table. */
export interface HsinSignalNarrativeRecord {
  id: string;
  signal_id: string;
  narrative_id: string;
  /** 0..1 confidence. */
  confidence?: number;
  rationale?: string;
  created_at: string;
}

/** A directed edge between two narratives. Mirrors the `hsin_narrative_edges` table. */
export interface HsinNarrativeEdgeRecord {
  id: string;
  source_narrative_id: string;
  target_narrative_id: string;
  edge_type: NarrativeEdgeType;
  weight?: number;
  rationale?: string;
  created_at: string;
}

/** A declarative triage rule (conditions -> actions). Mirrors the `hsin_triage_rules` table. */
export interface HsinTriageRuleRecord {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  /** Match conditions (jsonb array). */
  conditions_json: Record<string, unknown>[];
  /** Actions to apply on match (jsonb array). */
  actions_json: Record<string, unknown>[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** A per-severity SLA policy. Mirrors the `hsin_sla_policies` table. */
export interface HsinSlaPolicyRecord {
  id: string;
  name: string;
  severity?: SlaSeverity;
  /** Review deadline in hours. */
  review_deadline_hours?: number;
  /** Escalation deadline in hours. */
  escalation_deadline_hours?: number;
  created_at: string;
  updated_at: string;
}

/** An outbound provider account + config. Mirrors the `hsin_provider_accounts` table. */
export interface HsinProviderAccountRecord {
  id: string;
  provider_name: string;
  enabled: boolean;
  /** Provider credentials/options (jsonb). */
  config_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** The current rate-limit window for a provider. Mirrors the `hsin_provider_rate_limits` table. */
export interface HsinProviderRateLimitRecord {
  id: string;
  provider_name: string;
  window_seconds?: number;
  max_requests?: number;
  remaining_requests?: number;
  reset_at?: string;
  created_at: string;
  updated_at: string;
}

/** Aggregate data backing the operations console. */
export interface OperationsOverview {
  queued: number;
  running: number;
  failed: number;
  retrying: number;
  /** Jobs completed in the last 24 hours. */
  completed24h: number;
  recentAttempts: HsinJobAttemptRecord[];
  /** hsin_source_health.status (or derived source status) -> count. */
  sourceHealthSummary: Record<string, number>;
  providerRateLimits: HsinProviderRateLimitRecord[];
  schedulerRules: HsinSchedulerRuleRecord[];
  /** Signals captured per day. */
  captureThroughput: { date: string; count: number }[];
  /** Alerts raised per day. */
  alertThroughput: { date: string; count: number }[];
}

/** The narrative/entity knowledge graph payload backing the graph UI. */
export interface NarrativeGraphData {
  narratives: HsinNarrativeRecord[];
  entities: HsinEntityRecord[];
  edges: HsinNarrativeEdgeRecord[];
  signalNarratives: HsinSignalNarrativeRecord[];
  signalEntities: HsinSignalEntityRecord[];
}

/** A queued job plus its full attempt history (the job detail load shape). */
export interface JobWithAttempts {
  job: HsinJobQueueRecord;
  attempts: HsinJobAttemptRecord[];
}

// =============================================================================
// Provider Adapters & Scaled Queue — Phase 9
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 9 persistence (migration 0013): the
// hsin_job_queue visibility-timeout + dead-letter additions, the dead-letter
// queue, real-provider run observability, derived source-reliability + narrative-
// amplification scoring, narrative-graph community detection, and the WorldForge
// fusion bridge (signal/narrative -> research run/world) — plus the view-model
// shapes the providers/communities/amplification consoles render.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phases 7-8);
// their TS record names carry the `Hsin` prefix to mirror that. Timestamps are ISO
// strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/**
 * Why a real provider adapter invocation ended (success implied when absent).
 * Mirrors hsin_provider_runs.reason and hsin_dead_letter_jobs.reason.
 */
export type ProviderReason =
  | 'provider_not_configured'
  | 'blocked'
  | 'timeout'
  | 'fetch_error'
  | 'parse_error'
  | 'policy_violation';

/** Coarse reliability tier for a source. Mirrors hsin_source_reliability.tier. */
export type SourceReliabilityTier = 'high' | 'medium' | 'low' | 'unproven';

/** Lifecycle status of a WorldForge fusion link. Mirrors hsin_worldforge_links.status. */
export type WorldforgeLinkStatus = 'draft' | 'approved' | 'rejected' | 'created';

/**
 * A job that exhausted its retry budget and was moved off the live queue.
 * Mirrors the `hsin_dead_letter_jobs` table.
 */
export interface HsinDeadLetterJobRecord {
  id: string;
  job_id?: string;
  job_type?: string;
  source_id?: string;
  /** Snapshot of the failed job's input (jsonb). */
  payload_json?: Record<string, unknown>;
  attempt_count?: number;
  max_attempts?: number;
  /** Terminal failure reason. */
  reason?: ProviderReason | string;
  last_error?: string;
  dead_lettered_at?: string;
  /** Set when the job was manually re-driven back onto the queue. */
  requeued_at?: string;
  created_at: string;
}

/** One real provider-adapter invocation + its observability counters. Mirrors `hsin_provider_runs`. */
export interface HsinProviderRunRecord {
  id: string;
  provider_name: string;
  source_id?: string;
  started_at?: string;
  finished_at?: string;
  ok?: boolean;
  reason?: ProviderReason | string;
  /** Items parsed from the response. */
  item_count?: number;
  /** Bytes read from the response. */
  bytes?: number;
  http_status?: number;
  note?: string;
  created_at: string;
}

/** A derived per-source reliability profile. Mirrors the `hsin_source_reliability` table. */
export interface HsinSourceReliabilityRecord {
  id: string;
  source_id: string;
  /** 0..100 blended reliability score. */
  reliability_score?: number;
  tier?: SourceReliabilityTier;
  /** 0..1 fraction of capture attempts that succeeded. */
  capture_success_rate?: number;
  /** 0..1 fraction of attempts blocked by the provider/source. */
  blocked_rate?: number;
  /** 0..1 fraction of downstream signals approved. */
  approved_rate?: number;
  /** 0..1 fraction of downstream signals contradicted. */
  contradiction_rate?: number;
  signal_count?: number;
  rationale?: string;
  computed_at?: string;
  created_at: string;
  updated_at: string;
}

/** A derived per-narrative amplification profile. Mirrors the `hsin_amplification_scores` table. */
export interface HsinAmplificationScoreRecord {
  id: string;
  narrative_id: string;
  /** 0..100 amplification score. */
  amplification?: number;
  source_count?: number;
  signal_count?: number;
  /** Amplification velocity (rate of spread). */
  velocity?: number;
  rationale?: string;
  computed_at?: string;
  created_at: string;
}

/** A detected community (cluster) over the narrative graph. Mirrors the `hsin_graph_communities` table. */
export interface HsinGraphCommunityRecord {
  id: string;
  label?: string;
  /** Community-detection algorithm (default 'label-propagation'). */
  algorithm?: string;
  /** Member narrative ids (uuid[]). */
  member_narrative_ids: string[];
  size?: number;
  /** Arbitrary computed community metrics (jsonb). */
  metrics_json?: Record<string, unknown>;
  computed_at?: string;
  created_at: string;
}

/**
 * The cross-subsystem bridge fusing a captured signal/narrative into a WorldForge
 * research run / world. Mirrors the `hsin_worldforge_links` table.
 */
export interface HsinWorldforgeLinkRecord {
  id: string;
  signal_id?: string;
  narrative_id?: string;
  research_run_id?: string;
  world_id?: string;
  prompt_draft?: string;
  status: WorldforgeLinkStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** Aggregate data backing the providers console (runs + live rate limits + reliabilities). */
export interface ProvidersOverview {
  runs: HsinProviderRunRecord[];
  rateLimits: HsinProviderRateLimitRecord[];
  reliabilities: HsinSourceReliabilityRecord[];
}

/** The narrative-graph community view: detected communities + the narratives they cluster. */
export interface CommunitiesView {
  communities: HsinGraphCommunityRecord[];
  narratives: HsinNarrativeRecord[];
}

/** The amplification view: per-narrative amplification scores + the narratives they score. */
export interface AmplificationView {
  scores: HsinAmplificationScoreRecord[];
  narratives: HsinNarrativeRecord[];
}

/**
 * A draft of a WorldForge fusion proposal assembled from a captured signal/narrative
 * before it is turned into a research run / world.
 */
export interface WorldforgeFusionDraft {
  signalId?: string;
  narrativeId?: string;
  title: string;
  promptDraft: string;
  rationale: string[];
}

// =============================================================================
// Temporal Intelligence — Phase 10
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 10 persistence (migration 0014): the temporal
// layer over the narrative-intelligence graph — point-in-time narrative SNAPSHOTS,
// the typed EVOLUTION between consecutive snapshots, cross-narrative GENEALOGY
// (lineage) and INFLUENCE edges, and probabilistic FORECASTS — plus the view-model
// shapes the WorldForge evolution/genealogy/influence/forecast consoles render and
// the NarrativeHistory bundle the WorldForge fusion bridge consumes.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phases 7-9);
// their TS record names carry the `Hsin` prefix to mirror that. Timestamps are ISO
// strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/** A typed change observed between two snapshots of a narrative. Mirrors hsin_narrative_evolution.change_type. */
export type NarrativeChangeType = 'growth' | 'decline' | 'mutation' | 'split' | 'merge';

/** A typed lineage edge between two narratives. Mirrors hsin_narrative_genealogy.relationship. */
export type NarrativeGenealogyRelationship =
  | 'derived_from'
  | 'split_from'
  | 'merged_from'
  | 'contradicts'
  | 'amplifies';

/** A forecasted trajectory state for a narrative. Mirrors hsin_narrative_forecasts.forecast_type. */
export type NarrativeForecastState = 'emerging' | 'rising' | 'stable' | 'declining' | 'dead';

/** How often the temporal worker captures narrative snapshots. */
export type SnapshotCadence = 'daily' | 'weekly' | 'monthly';

/** A point-in-time capture of a narrative's shape. Mirrors the `hsin_narrative_snapshots` table. */
export interface HsinNarrativeSnapshotRecord {
  id: string;
  narrative_id: string;
  captured_at: string;
  signal_count?: number;
  source_count?: number;
  community_count?: number;
  amplification_score?: number;
  reliability_score?: number;
  support_ratio?: number;
  contradiction_ratio?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/** A typed change between two snapshots of a narrative. Mirrors the `hsin_narrative_evolution` table. */
export interface HsinNarrativeEvolutionRecord {
  id: string;
  narrative_id?: string;
  parent_snapshot_id?: string;
  child_snapshot_id?: string;
  change_type?: NarrativeChangeType;
  growth_pct?: number;
  /** 0..1 confidence. */
  confidence?: number;
  metrics_json?: Record<string, unknown>;
  reasoning_json?: Record<string, unknown>;
  created_at: string;
}

/** A typed lineage edge between two narratives. Mirrors the `hsin_narrative_genealogy` table. */
export interface HsinNarrativeGenealogyRecord {
  id: string;
  parent_narrative_id?: string;
  child_narrative_id?: string;
  relationship?: NarrativeGenealogyRelationship;
  /** 0..1 confidence. */
  confidence?: number;
  shared_entities?: number;
  shared_sources?: number;
  similarity?: number;
  rationale?: string;
  created_at: string;
}

/** A directed influence score between two narratives. Mirrors the `hsin_narrative_influence` table. */
export interface HsinNarrativeInfluenceRecord {
  id: string;
  source_narrative_id?: string;
  target_narrative_id?: string;
  /** 0..100 influence score. */
  influence_score?: number;
  shared_entities?: number;
  shared_sources?: number;
  shared_communities?: number;
  rationale?: string;
  created_at: string;
}

/** A probabilistic trajectory forecast for a narrative. Mirrors the `hsin_narrative_forecasts` table. */
export interface HsinNarrativeForecastRecord {
  id: string;
  narrative_id?: string;
  forecast_type?: NarrativeForecastState;
  /** 0..1 probability of the forecast_type state. */
  probability?: number;
  reasoning?: Record<string, unknown>;
  distribution_json?: Record<string, unknown>;
  generated_at: string;
  created_at: string;
}

/** The evolution view: narratives with their snapshots and the typed changes between them. */
export interface EvolutionView {
  narratives: HsinNarrativeRecord[];
  snapshots: HsinNarrativeSnapshotRecord[];
  evolution: HsinNarrativeEvolutionRecord[];
}

/** The genealogy view: narratives + their typed lineage edges. */
export interface GenealogyView {
  narratives: HsinNarrativeRecord[];
  edges: HsinNarrativeGenealogyRecord[];
}

/** The influence view: narratives + their directed influence edges. */
export interface InfluenceView {
  narratives: HsinNarrativeRecord[];
  edges: HsinNarrativeInfluenceRecord[];
}

/** The forecast view: narratives + their probabilistic trajectory forecasts. */
export interface ForecastView {
  narratives: HsinNarrativeRecord[];
  forecasts: HsinNarrativeForecastRecord[];
}

/** Headline temporal callouts surfaced on the temporal-intelligence dashboard. */
export interface TemporalHighlights {
  fastestGrowing?: { narrativeId: string; name: string; growthPct: number };
  largestCommunityExpansion?: { narrativeId: string; name: string; communityDelta: number };
  largestAmplificationSpike?: { narrativeId: string; name: string; amplificationDelta: number };
  mostInfluential?: { narrativeId: string; name: string; influenceScore: number };
  newestEmerging?: { narrativeId: string; name: string; probability: number };
}

/**
 * The full temporal history bundle for a single narrative (snapshots + evolution +
 * genealogy + influence + latest forecast). Consumed by the WorldForge fusion bridge.
 */
export interface NarrativeHistory {
  narrativeId: string;
  snapshots: HsinNarrativeSnapshotRecord[];
  evolution: HsinNarrativeEvolutionRecord[];
  genealogy: HsinNarrativeGenealogyRecord[];
  influence: HsinNarrativeInfluenceRecord[];
  forecast?: HsinNarrativeForecastRecord;
}

// =============================================================================
// Causal Intelligence — Phase 11
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 11 persistence (migration 0015): the causal +
// replay layer over the narrative-intelligence graph — discrete causal EVENTS in a
// narrative's life, the ordered causal CHAINS that explain why it moved, the
// point-in-time REPLAY FRAMES used to scrub its history, and the lifecycle
// MILESTONES (birth -> ... -> death / resurgence) — plus the view-model shapes the
// WorldForge causal/replay/milestone consoles render and the narrative-explanation
// / highlights / timeline payloads the WorldForge fusion bridge consumes.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phases
// 7-10); their TS record names carry the `Hsin` prefix to mirror that. Timestamps
// are ISO strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/** A discrete, typed causal event in a narrative's life. Mirrors hsin_causal_events.event_type. */
export type CausalEventType =
  | 'signal_surge'
  | 'source_expansion'
  | 'community_growth'
  | 'amplification_spike'
  | 'contradiction_drop'
  | 'contradiction_rise'
  | 'forecast_shift'
  | 'influence_transfer';

/** A typed lifecycle milestone for a narrative. Mirrors hsin_narrative_milestones.milestone_type. */
export type MilestoneType =
  | 'birth'
  | 'growth'
  | 'viral'
  | 'peak'
  | 'decline'
  | 'death'
  | 'resurgence';

/** A discrete, typed causal event in a narrative's life. Mirrors the `hsin_causal_events` table. */
export interface HsinCausalEventRecord {
  id: string;
  narrative_id: string;
  event_type: CausalEventType;
  /** 0..100 event strength. */
  event_strength?: number;
  /** 0..1 confidence. */
  confidence?: number;
  explanation?: string;
  metrics_json?: Record<string, unknown>;
  occurred_at?: string;
  created_at: string;
}

/** A named, confidence-scored chain of causal events. Mirrors the `hsin_causal_chains` table. */
export interface HsinCausalChainRecord {
  id: string;
  narrative_id: string;
  chain_name?: string;
  /** 0..1 confidence. */
  confidence?: number;
  summary?: string;
  created_at: string;
  updated_at: string;
}

/** Ordered membership of a causal event in a chain. Mirrors the `hsin_causal_chain_events` table. */
export interface HsinCausalChainEventRecord {
  id: string;
  chain_id: string;
  event_id?: string;
  sequence_order: number;
  created_at: string;
}

/** A point-in-time frame for narrative replay. Mirrors the `hsin_replay_frames` table. */
export interface HsinReplayFrameRecord {
  id: string;
  narrative_id: string;
  frame_timestamp: string;
  frame_data: Record<string, unknown>;
  created_at: string;
}

/** A typed lifecycle milestone for a narrative. Mirrors the `hsin_narrative_milestones` table. */
export interface HsinNarrativeMilestoneRecord {
  id: string;
  narrative_id: string;
  milestone_type: MilestoneType;
  /** 0..1 confidence. */
  confidence?: number;
  description?: string;
  metrics_json?: Record<string, unknown>;
  occurred_at?: string;
  created_at: string;
}

/** The causal view: narratives, their causal events, and the chains (with member events) over them. */
export interface CausalView {
  narratives: HsinNarrativeRecord[];
  events: HsinCausalEventRecord[];
  chains: (HsinCausalChainRecord & { events: HsinCausalEventRecord[] })[];
}

/** The replay view: a single narrative with its ordered replay frames and lifecycle milestones. */
export interface ReplayView {
  narrative: HsinNarrativeRecord | null;
  frames: HsinReplayFrameRecord[];
  milestones: HsinNarrativeMilestoneRecord[];
}

/** The milestones view: narratives + their lifecycle milestones. */
export interface MilestonesView {
  narratives: HsinNarrativeRecord[];
  milestones: HsinNarrativeMilestoneRecord[];
}

/** A generated natural-language explanation of why a narrative moved, with supporting factors. */
export interface CausalExplanation {
  narrativeId: string;
  headline: string;
  text: string;
  factors: { label: string; detail: string; metric?: number }[];
  /** 0..1 confidence in the explanation. */
  confidence: number;
  generatedAt: string;
}

/** Headline causal callouts surfaced on the causal-intelligence dashboard. */
export interface CausalHighlights {
  mostSignificantEvent?: {
    narrativeId: string;
    name: string;
    eventType: CausalEventType;
    eventStrength: number;
  };
  fastestGrowth?: { narrativeId: string; name: string; growthPct: number };
  largestForecastShift?: { narrativeId: string; name: string; detail: string };
  largestAmplificationSpike?: { narrativeId: string; name: string; eventStrength: number };
  mostImportantCommunityExpansion?: { narrativeId: string; name: string; eventStrength: number };
  mostInfluentialSource?: { sourceId?: string; name: string; detail: string };
}

/**
 * A WorldForge narrative timeline: the epochs of a narrative's life, its turning
 * points, and seed prompts for counterfactual ("what if") exploration. Consumed by
 * the WorldForge fusion bridge.
 */
export interface WorldforgeTimeline {
  narrativeId: string;
  epochs: { label: string; startAt?: string; endAt?: string; summary: string }[];
  turningPoints: { at: string; milestoneType?: string; description: string }[];
  counterfactualSeeds: { prompt: string; basis: string }[];
}

// =============================================================================
// Counterfactual Simulation — Phase 12
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 12 persistence (migration 0016): the
// counterfactual + backtesting layer over the causal/temporal narrative-
// intelligence graph (Phases 10-11). A simulation RUN asks "what if?" of a
// narrative (remove/delay/accelerate an event, change amplification, add/remove a
// source or community, shift reliability or contradiction); each run captures the
// per-event ACTIONS it applied, stores simulated RESULTS against real forecasts,
// feeds rolling FORECAST ACCURACY / calibration per narrative window, and
// materializes WorldForge SCENARIOS (alternate world-states) — plus the view-model
// shapes the WorldForge simulation / backtesting / scenarios consoles render and
// the highlights payload the WorldForge fusion bridge consumes.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phases
// 7-11); their TS record names carry the `Hsin` prefix to mirror that. Timestamps
// are ISO strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/** The intervention a counterfactual run applies. Mirrors hsin_counterfactual_runs.scenario_type. */
export type CounterfactualScenarioType =
  | 'remove_event'
  | 'delay_event'
  | 'accelerate_event'
  | 'reduce_amplification'
  | 'increase_amplification'
  | 'remove_source'
  | 'add_source'
  | 'remove_community'
  | 'increase_reliability'
  | 'decrease_reliability'
  | 'remove_contradiction'
  | 'increase_contradiction';

/** The action a run applied to a causal event. Mirrors hsin_counterfactual_events.action. */
export type CounterfactualActionType =
  | 'removed'
  | 'reduced'
  | 'amplified'
  | 'delayed'
  | 'accelerated';

/** A coarse confidence band used by simulation view-models. */
export type ConfidenceBand = 'low' | 'medium' | 'high';

/** A single "what if?" counterfactual simulation over a narrative. Mirrors the `hsin_counterfactual_runs` table. */
export interface HsinCounterfactualRunRecord {
  id: string;
  created_at: string;
  narrative_id: string;
  scenario_name?: string;
  scenario_type: CounterfactualScenarioType;
  /** 0..1 confidence. */
  confidence?: number;
  summary?: string;
  inputs_json?: Record<string, unknown>;
  results_json?: Record<string, unknown>;
  generated_at?: string;
  created_by?: string;
}

/** The action a counterfactual run applied to a causal event. Mirrors the `hsin_counterfactual_events` table. */
export interface HsinCounterfactualEventRecord {
  id: string;
  counterfactual_run_id: string;
  original_event_id?: string;
  action?: CounterfactualActionType;
  impact_score?: number;
  reasoning?: string;
  created_at: string;
}

/** A simulated predicted state/probability scored against the actual. Mirrors the `hsin_simulation_results` table. */
export interface HsinSimulationResultRecord {
  id: string;
  counterfactual_run_id: string;
  forecast_id?: string;
  predicted_state?: string;
  predicted_probability?: number;
  actual_state?: string;
  actual_probability?: number;
  error_score?: number;
  created_at: string;
}

/** Rolling accuracy/calibration per narrative + forecast window. Mirrors the `hsin_forecast_accuracy` table. */
export interface HsinForecastAccuracyRecord {
  id: string;
  narrative_id: string;
  forecast_window?: string;
  prediction_count?: number;
  /** 0..1 accuracy. */
  accuracy_score?: number;
  /** 0..1 calibration. */
  calibration_score?: number;
  updated_at?: string;
  created_at: string;
}

/** An alternate world-state materialized from a counterfactual run. Mirrors the `hsin_worldforge_scenarios` table. */
export interface HsinWorldforgeScenarioRecord {
  id: string;
  counterfactual_run_id: string;
  worldforge_link_id?: string;
  scenario_title?: string;
  scenario_summary?: string;
  world_state?: Record<string, unknown>;
  /** 0..1 confidence. */
  confidence?: number;
  created_at: string;
}

/** The simulation overview: recent/top runs, accuracy, scenarios, and aggregate accuracy/calibration. */
export interface SimulationOverview {
  recentRuns: HsinCounterfactualRunRecord[];
  topRuns: HsinCounterfactualRunRecord[];
  accuracy: HsinForecastAccuracyRecord[];
  scenarios: HsinWorldforgeScenarioRecord[];
  avgAccuracy: number;
  avgCalibration: number;
}

/** A single counterfactual run with its applied events, simulated results, and the source narrative. */
export interface CounterfactualRunView {
  run: HsinCounterfactualRunRecord;
  events: HsinCounterfactualEventRecord[];
  results: HsinSimulationResultRecord[];
  narrative: HsinNarrativeRecord | null;
}

/** The backtesting view: accuracy/results across narratives, plus stated-vs-empirical confidence drift per window. */
export interface BacktestingView {
  accuracy: HsinForecastAccuracyRecord[];
  results: HsinSimulationResultRecord[];
  narratives: HsinNarrativeRecord[];
  avgAccuracy: number;
  avgCalibration: number;
  confidenceDrift: { window: string; stated: number; empirical: number }[];
}

/** The WorldForge scenarios view: materialized scenarios (optionally with their run) + the source narratives. */
export interface WorldforgeScenariosView {
  scenarios: (HsinWorldforgeScenarioRecord & { run?: HsinCounterfactualRunRecord })[];
  narratives: HsinNarrativeRecord[];
}

/** Headline simulation callouts surfaced on the counterfactual / backtesting dashboard. */
export interface SimulationHighlights {
  simulationQueue?: number;
  latestRun?: {
    id: string;
    narrativeId: string;
    name: string;
    scenarioType: CounterfactualScenarioType;
    confidence: number;
  };
  forecastAccuracy?: number;
  calibrationHealth?: number;
  scenariosGenerated?: number;
}

// =============================================================================
// Decision Intelligence — Phase 13
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 13 persistence (migration 0017): the
// decision-intelligence + strategic war-gaming layer over the counterfactual /
// causal / temporal narrative-intelligence graph (Phases 10-12). A decision RUN
// recommends a strategic action for a narrative (intervene / monitor / escalate /
// no-action / counter-narrative); each run captures head-to-head SCENARIO
// COMPARISONS (war-gaming "scenario A vs scenario B"), ranked candidate
// INTERVENTIONS by expected effect / risk / confidence, CROSS-NARRATIVE IMPACTS
// (how one narrative amplifies/dampens/triggers/competes-with/reinforces another),
// and a tamper-evident DECISION AUDIT (output + confidence + limitations + log) —
// plus the view-model shapes the decision / war-gaming / cross-narrative consoles
// render and the highlights payload the WorldForge fusion bridge consumes.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phases
// 7-12); their TS record names carry the `Hsin` prefix to mirror that. Timestamps
// are ISO strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` so shared-types stays decoupled from the engine internals.
// =============================================================================

/** The strategic action a decision run recommends. Mirrors hsin_decision_runs.decision_type. */
export type DecisionType =
  | 'intervention'
  | 'monitor'
  | 'escalate'
  | 'no_action'
  | 'counter_narrative';

/** How one narrative affects another. Mirrors hsin_cross_narrative_impacts.impact_type. */
export type DecisionImpactType =
  | 'amplifies'
  | 'dampens'
  | 'triggers'
  | 'competes'
  | 'reinforces'
  | 'neutral';

/** The favoured side of a scenario comparison. Mirrors hsin_scenario_comparisons.winner. */
export type ScenarioWinner = 'A' | 'B' | 'tie';

/** A decision-intelligence run recommending a strategic action for a narrative. Mirrors the `hsin_decision_runs` table. */
export interface HsinDecisionRunRecord {
  id: string;
  created_at: string;
  narrative_id: string;
  decision_name?: string;
  decision_type?: DecisionType;
  /** 0..1 confidence. */
  confidence?: number;
  recommended_action?: string;
  reasoning?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  generated_at?: string;
  created_by?: string;
}

/** A head-to-head scenario A vs scenario B war-game for a decision run. Mirrors the `hsin_scenario_comparisons` table. */
export interface HsinScenarioComparisonRecord {
  id: string;
  decision_run_id: string;
  scenario_a?: Record<string, unknown>;
  scenario_b?: Record<string, unknown>;
  winner?: string;
  /** 0..1 confidence. */
  confidence?: number;
  comparison_reasoning?: string;
  created_at: string;
}

/** A ranked candidate intervention for a decision run. Mirrors the `hsin_intervention_rankings` table. */
export interface HsinInterventionRankingRecord {
  id: string;
  decision_run_id: string;
  intervention_type?: string;
  expected_effect?: number;
  risk_score?: number;
  /** 0..1 confidence. */
  confidence?: number;
  rank_position?: number;
  reasoning?: string;
  created_at: string;
}

/** How a source narrative affects a target narrative. Mirrors the `hsin_cross_narrative_impacts` table. */
export interface HsinCrossNarrativeImpactRecord {
  id: string;
  source_narrative_id: string;
  target_narrative_id: string;
  impact_type?: DecisionImpactType;
  /** 0..100 impact strength. */
  impact_strength?: number;
  /** 0..1 confidence. */
  confidence?: number;
  reasoning?: string;
  created_at: string;
}

/** The audit record for a decision run. Mirrors the `hsin_decision_audits` table. */
export interface HsinDecisionAuditRecord {
  id: string;
  decision_run_id: string;
  decision_output?: Record<string, unknown>;
  /** 0..1 confidence. */
  confidence?: number;
  limitations?: Record<string, unknown>;
  audit_log?: Record<string, unknown>;
  created_at: string;
}

/** The decision dashboard overview: recent runs, top rankings, highest-risk narratives, recommendations, and aggregate confidence. */
export interface DecisionDashboardData {
  recentRuns: HsinDecisionRunRecord[];
  topRankings: HsinInterventionRankingRecord[];
  highestRiskNarratives: { narrativeId: string; name: string; riskScore: number }[];
  recommendations: HsinDecisionRunRecord[];
  avgConfidence: number;
}

/** A single decision run with its rankings, scenario comparisons, audit, and source narrative. */
export interface DecisionRunView {
  run: HsinDecisionRunRecord;
  rankings: HsinInterventionRankingRecord[];
  comparisons: HsinScenarioComparisonRecord[];
  audit: HsinDecisionAuditRecord | null;
  narrative: HsinNarrativeRecord | null;
}

/** The scenario war-gaming view: comparisons (optionally with their run) + the source narratives. */
export interface ScenarioComparisonView {
  comparisons: (HsinScenarioComparisonRecord & { run?: HsinDecisionRunRecord })[];
  narratives: HsinNarrativeRecord[];
}

/** The cross-narrative impact view: the narratives and the directed impacts between them. */
export interface CrossNarrativeImpactView {
  narratives: HsinNarrativeRecord[];
  impacts: HsinCrossNarrativeImpactRecord[];
}

/** Headline decision callouts surfaced on the decision-intelligence dashboard. */
export interface DecisionHighlights {
  decisionHealth?: number;
  recommendationQueue?: number;
  topRisks?: { narrativeId: string; name: string; riskScore: number }[];
  scenarioBattles?: number;
  crossNarrativeEffects?: number;
}

/** A flattened decision-explorer result row (intervention candidate + structured reasoning/limitations). */
export interface DecisionExplorerResult {
  narrativeId: string;
  interventionType: string;
  expectedEffect: number;
  riskScore: number;
  confidence: number;
  reasoning: string[];
  limitations: string[];
}

// =============================================================================
// Auth & Security Hardening — Phase 14
// -----------------------------------------------------------------------------
// Serializable mirrors of the Phase 14 persistence (migration 0018): the
// PLATFORM-SECURITY telemetry layer. Structured logs for auth diagnostics,
// security audit events, login attempts, session lifecycle events, and access
// (authorization) denials, plus an admin triage/review queue over them — and the
// view-model shapes the Security dashboard renders (health checks + the failed
// login / access-denial / security-event / session feeds with 24h counts).
//
// These tables are intentionally NOT `hsin_`-prefixed (cross-cutting security
// infrastructure, not part of the narrative-intelligence graph) and are named
// distinctly from 0001's `security_events` / `audit_logs` (no collision).
// Timestamps are ISO strings; uuid columns are strings. jsonb `metadata` is typed
// as `Record<string, unknown>`. Every record carries the shared base columns
// (user_id/event_type/severity/ip_address/user_agent/route/message/metadata),
// all optional, plus per-table extras.
// =============================================================================

/** Severity tag shared by all Phase 14 security telemetry tables. Mirrors the `severity` CHECK constraint. */
export type SecurityEventSeverity = 'info' | 'warning' | 'error' | 'critical';

/** Triage state of an admin security review. Mirrors admin_security_reviews.status. */
export type SecurityReviewStatus = 'open' | 'reviewed' | 'dismissed' | 'escalated';

/** Status of a dependency health check surfaced on the Security dashboard. */
export type HealthServiceStatus = 'ok' | 'degraded' | 'down' | 'unconfigured';

/** A health/diagnostic probe for auth + dependent services. Mirrors the `auth_diagnostics` table. */
export interface AuthDiagnosticRecord {
  id: string;
  user_id?: string;
  event_type?: string;
  severity?: SecurityEventSeverity;
  ip_address?: string;
  user_agent?: string;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  code?: string;
  service?: string;
  ok?: boolean;
  created_at: string;
}

/** A general security audit-trail event. Mirrors the `security_audit_events` table. */
export interface SecurityAuditEventRecord {
  id: string;
  user_id?: string;
  event_type?: string;
  severity?: SecurityEventSeverity;
  ip_address?: string;
  user_agent?: string;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/** A login attempt (success/failure) keyed by email + ip. Mirrors the `login_attempts` table. */
export interface LoginAttemptRecord {
  id: string;
  user_id?: string;
  event_type?: string;
  severity?: SecurityEventSeverity;
  ip_address?: string;
  user_agent?: string;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  email?: string;
  success?: boolean;
  created_at: string;
}

/** A session lifecycle event (created/refreshed/revoked/expired). Mirrors the `session_events` table. */
export interface SessionEventRecord {
  id: string;
  user_id?: string;
  event_type?: string;
  severity?: SecurityEventSeverity;
  ip_address?: string;
  user_agent?: string;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/** An authorization denial (route + required vs actual role). Mirrors the `access_denials` table. */
export interface AccessDenialRecord {
  id: string;
  user_id?: string;
  event_type?: string;
  severity?: SecurityEventSeverity;
  ip_address?: string;
  user_agent?: string;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  required_role?: string;
  actual_role?: string;
  created_at: string;
}

/** An admin triage/review record over the security signals. Mirrors the `admin_security_reviews` table. */
export interface AdminSecurityReviewRecord {
  id: string;
  user_id?: string;
  event_type?: string;
  severity?: SecurityEventSeverity;
  ip_address?: string;
  user_agent?: string;
  route?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  reviewed_by?: string;
  status?: SecurityReviewStatus;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

/** The result of a single dependency health check rendered on the Security dashboard. */
export interface HealthCheckResult {
  ok: boolean;
  service: string;
  status: HealthServiceStatus;
  message: string;
  details?: Record<string, unknown>;
}

/** The Security dashboard payload: health checks, security feeds, optional Cloudflare warning, and 24h counts. */
/**
 * Startup env-validation summary for the security dashboard / diagnostics.
 * Contains NO raw env values (only presence/validity + readable warnings).
 */
export interface EnvValidationSummary {
  ok: boolean;
  requiredMissing: string[];
  optionalMissing: string[];
  required: { key: string; present: boolean; valid: boolean; message?: string }[];
  optional: { key: string; present: boolean }[];
  warnings: { key: string; message: string }[];
}

export interface SecurityDashboardData {
  health: HealthCheckResult[];
  failedLogins: LoginAttemptRecord[];
  accessDenials: AccessDenialRecord[];
  securityEvents: SecurityAuditEventRecord[];
  sessionEvents: SessionEventRecord[];
  cloudflareWarning?: string;
  /** Phase 14B: startup env validation (required/optional). No secret values. */
  env?: EnvValidationSummary;
  counts: {
    failedLogins24h: number;
    accessDenials24h: number;
    criticalEvents24h: number;
  };
}

// =============================================================================
// Outcome Tracking & Learning — Phase 15
//
// Serializable mirrors of the Phase 15 persistence (migration 0019): the
// recommendation OUTCOME of a Phase-13 decision run, its per-metric
// MEASUREMENTS, the per-intervention CONFIDENCE-LEARNING calibration, the
// decision-intelligence ALERT feed, the GOVERNANCE-REVIEW workflow, and per-user
// FEEDBACK — plus the view-models that back the outcome dashboard, the outcome
// detail view, the governance queue, and the dashboard highlights.
// =============================================================================

/** Verdict on a recommendation outcome. Mirrors hsin_recommendation_outcomes.status. */
export type OutcomeStatus =
  | 'successful'
  | 'partially_successful'
  | 'neutral'
  | 'unsuccessful'
  | 'inconclusive';

/**
 * The classification of a decision-intelligence alert. Mirrors hsin_decision_alerts.alert_type.
 * Extended in Phase 16 (migration 0020) with the four calibration/trust alert types
 * ('calibration_drift' | 'trust_collapse' | 'confidence_instability' | 'forecast_miscalibration').
 */
export type OutcomeAlertType =
  | 'recommendation_failed'
  | 'confidence_drift'
  | 'narrative_spike'
  | 'forecast_miss'
  | 'resurgence'
  | 'security_anomaly'
  // --- Phase 16: Calibration & Trust alert types (additive). ---
  | 'calibration_drift'
  | 'trust_collapse'
  | 'confidence_instability'
  | 'forecast_miscalibration';

/** The triage lifecycle state of a decision alert. Mirrors hsin_decision_alerts.status. */
export type DecisionAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'escalated';

/** The verdict of a governance review over an outcome. Mirrors hsin_governance_reviews.decision. */
export type GovernanceDecision = 'pending' | 'approved' | 'rejected' | 'escalated' | 'validated';

/** The observed outcome of a Phase-13 decision run. Mirrors the `hsin_recommendation_outcomes` table. */
export interface HsinRecommendationOutcomeRecord {
  id: string;
  decision_run_id?: string;
  recommendation_id?: string;
  status?: OutcomeStatus;
  expected_outcome?: Record<string, unknown>;
  observed_outcome?: Record<string, unknown>;
  /** 0..1 confidence before the observation. */
  confidence_before?: number;
  /** 0..1 confidence after the observation. */
  confidence_after?: number;
  /** 0..100 success score. */
  success_score?: number;
  explanation?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

/** A per-metric expected-vs-observed measurement behind an outcome verdict. Mirrors the `hsin_outcome_measurements` table. */
export interface HsinOutcomeMeasurementRecord {
  id: string;
  outcome_id: string;
  metric?: string;
  expected_value?: number;
  observed_value?: number;
  delta?: number;
  within_expectation?: boolean;
  created_at: string;
}

/** Calibrated confidence per intervention type learned from outcome history. Mirrors the `hsin_confidence_learning` table. */
export interface HsinConfidenceLearningRecord {
  id: string;
  intervention_type: string;
  sample_count?: number;
  success_count?: number;
  avg_success_score?: number;
  /** 0..1 calibrated confidence. */
  calibrated_confidence?: number;
  adjustment?: number;
  rationale?: string;
  updated_at?: string;
  created_at: string;
}

/** A decision-intelligence alert. Mirrors the `hsin_decision_alerts` table. */
export interface HsinDecisionAlertRecord {
  id: string;
  decision_run_id?: string;
  alert_type?: OutcomeAlertType;
  /** Mirrors the hsin_decision_alerts.severity CHECK constraint (Phase 15 uses upper-case severities). */
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message?: string;
  explanation?: string;
  status?: DecisionAlertStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/** A validation/governance review over an outcome. Mirrors the `hsin_governance_reviews` table. */
export interface HsinGovernanceReviewRecord {
  id: string;
  outcome_id?: string;
  decision_run_id?: string;
  reviewer_id?: string;
  decision?: GovernanceDecision;
  notes?: string;
  status?: string;
  created_at: string;
  updated_at: string;
}

/** Per-user 1..5 rating + free-text feedback on a recommendation outcome. Mirrors the `hsin_recommendation_feedback` table. */
export interface HsinRecommendationFeedbackRecord {
  id: string;
  outcome_id?: string;
  user_id?: string;
  /** 1..5 rating. */
  rating?: number;
  feedback?: string;
  created_at: string;
}

/** The decision-performance dashboard: success/accuracy/ROI headline metrics, outcome distribution, and learning/intervention rollups. */
export interface DecisionPerformanceData {
  successRate: number;
  confidenceAccuracy: number;
  forecastAccuracy: number;
  decisionRoi: number;
  outcomeDistribution: { status: OutcomeStatus; count: number }[];
  learningTrends: { interventionType: string; calibratedConfidence: number; sampleCount: number }[];
  topInterventions: { interventionType: string; avgSuccessScore: number; sampleCount: number }[];
  worstInterventions: { interventionType: string; avgSuccessScore: number; sampleCount: number }[];
  recentOutcomes: HsinRecommendationOutcomeRecord[];
}

/** A single outcome with its measurements, governance reviews, audit trail, and source decision run. */
export interface OutcomeView {
  outcome: HsinRecommendationOutcomeRecord;
  measurements: HsinOutcomeMeasurementRecord[];
  governance: HsinGovernanceReviewRecord[];
  auditTrail: { step: string; detail: string; at?: string }[];
  decisionRun?: HsinDecisionRunRecord;
}

/** The governance queue: outcomes awaiting validation, the reviews over them, and the open alert feed. */
export interface GovernanceQueueData {
  pendingOutcomes: HsinRecommendationOutcomeRecord[];
  reviews: HsinGovernanceReviewRecord[];
  alerts: HsinDecisionAlertRecord[];
}

/** Headline outcome callouts surfaced on the decision-intelligence / outcome dashboard. */
export interface OutcomeDashboardHighlights {
  successRate?: number;
  openAlerts?: number;
  pendingReviews?: number;
  learningEntries?: number;
}

// =============================================================================
// Calibration & Trust — Phase 16
//
// Serializable mirrors of the Phase 16 persistence (migration 0020): the
// CALIBRATION layer (point-in-time calibration snapshots, the per-bin
// reliability-diagram rows behind them, standalone Brier scores, and detected
// confidence drift) and the TRUST layer (per-source / per-narrative / per-decision
// / per-forecast trust scores + bands with explanations, limitations, and manual
// overrides) — plus the view-models that back the calibration dashboard, a single
// calibration view, the trust dashboard, a single trust view, and the dashboard
// highlights. The OutcomeAlertType union (Phase 15, above) is EXTENDED in place
// with the four Phase-16 alert types.
//
// NAMING: the underlying tables use the `hsin_` prefix (consistent with Phases
// 7-15); their TS record names carry the `Hsin` prefix to mirror that. Timestamps
// are ISO strings; uuid columns are strings. jsonb payloads are typed as
// `Record<string, unknown>` (or `string[]` where the engine emits a list) so
// shared-types stays decoupled from the engine internals.
// =============================================================================

/** Classification of a detected confidence drift. Mirrors hsin_confidence_drift.drift_kind. */
export type ConfidenceDriftKind =
  | 'overconfidence'
  | 'underconfidence'
  | 'degradation'
  | 'improvement'
  | 'stable';

/** Labelled quality bucket for a Brier score / calibration snapshot. Mirrors hsin_brier_scores.calibration_quality. */
export type CalibrationQuality =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'insufficient_data';

/** Trust band for a trust score. Mirrors the `band` CHECK on the Phase-16 trust tables. */
export type TrustBand = 'low' | 'medium' | 'high';

/** The kind of entity a trust score applies to (used by the trust view-models). */
export type TrustEntityType =
  | 'source'
  | 'narrative'
  | 'forecast'
  | 'intervention'
  | 'recommendation'
  | 'decision';

/** A point-in-time calibration of predicted confidence vs observed success. Mirrors the `hsin_calibration_snapshots` table. */
export interface HsinCalibrationSnapshotRecord {
  id: string;
  scope?: string;
  kind?: string;
  sample_count?: number;
  /** Expected Calibration Error (ECE). */
  expected_calibration_error?: number;
  /** Maximum Calibration Error (MCE). */
  max_calibration_error?: number;
  overconfidence_index?: number;
  brier_score?: number;
  /** Reliability-diagram bins (jsonb). */
  curve?: Record<string, unknown>;
  generated_at?: string;
  created_by?: string;
  created_at: string;
}

/** A per-bin reliability-diagram row behind a calibration snapshot. Mirrors the `hsin_reliability_curves` table. */
export interface HsinReliabilityCurveRecord {
  id: string;
  calibration_snapshot_id?: string;
  bin_lower?: number;
  bin_upper?: number;
  count?: number;
  /** Mean predicted confidence in the bin. */
  mean_confidence?: number;
  /** Observed success rate in the bin. */
  observed_success?: number;
  calibration_error?: number;
  created_at: string;
}

/** A standalone Brier score per scope/kind. Mirrors the `hsin_brier_scores` table. */
export interface HsinBrierScoreRecord {
  id: string;
  scope?: string;
  kind?: string;
  score?: number;
  sample_count?: number;
  calibration_quality?: CalibrationQuality;
  interpretation?: string;
  /** Reliability/resolution/uncertainty decomposition (jsonb). */
  decomposition?: Record<string, unknown>;
  created_at: string;
}

/** A detected drift between a prior and current ECE. Mirrors the `hsin_confidence_drift` table. */
export interface HsinConfidenceDriftRecord {
  id: string;
  scope?: string;
  drift_kind?: ConfidenceDriftKind;
  magnitude?: number;
  current_ece?: number;
  prior_ece?: number;
  recommendation?: string;
  explanation?: string;
  detected_at?: string;
  created_at: string;
}

/** Trust for a monitored source. Mirrors the `hsin_source_trust` table. */
export interface HsinSourceTrustRecord {
  id: string;
  source_id?: string;
  /** 0..100 trust score. */
  trust_score?: number;
  /** 0..1 confidence. */
  confidence?: number;
  evidence_count?: number;
  calibration_score?: number;
  band?: TrustBand;
  explanation?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  overridden?: boolean;
  override_reason?: string;
  overridden_by?: string;
  last_updated?: string;
  created_at: string;
  updated_at: string;
}

/** Trust for a tracked narrative. Mirrors the `hsin_narrative_trust` table. */
export interface HsinNarrativeTrustRecord {
  id: string;
  narrative_id?: string;
  /** 0..100 trust score. */
  trust_score?: number;
  /** 0..1 confidence. */
  confidence?: number;
  evidence_count?: number;
  calibration_score?: number;
  band?: TrustBand;
  explanation?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  overridden?: boolean;
  override_reason?: string;
  overridden_by?: string;
  last_updated?: string;
  created_at: string;
  updated_at: string;
}

/** Trust for a Phase-13 decision run. Mirrors the `hsin_decision_trust` table. */
export interface HsinDecisionTrustRecord {
  id: string;
  decision_run_id?: string;
  /** 0..100 trust score. */
  trust_score?: number;
  /** 0..1 confidence. */
  confidence?: number;
  evidence_count?: number;
  calibration_score?: number;
  band?: TrustBand;
  explanation?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  overridden?: boolean;
  override_reason?: string;
  overridden_by?: string;
  last_updated?: string;
  created_at: string;
  updated_at: string;
}

/** Trust for a narrative forecast. Mirrors the `hsin_forecast_trust` table. */
export interface HsinForecastTrustRecord {
  id: string;
  narrative_id?: string;
  forecast_kind?: string;
  /** 0..100 trust score. */
  trust_score?: number;
  /** 0..1 confidence. */
  confidence?: number;
  evidence_count?: number;
  calibration_score?: number;
  band?: TrustBand;
  explanation?: Record<string, unknown>;
  limitations?: Record<string, unknown>;
  overridden?: boolean;
  override_reason?: string;
  overridden_by?: string;
  last_updated?: string;
  created_at: string;
  updated_at: string;
}

/** The calibration dashboard: the latest snapshot, its curves, Brier scores, drift events, and the ECE/Brier trend over time. */
export interface CalibrationDashboardData {
  snapshot?: HsinCalibrationSnapshotRecord;
  curves: HsinReliabilityCurveRecord[];
  brier: HsinBrierScoreRecord[];
  drift: HsinConfidenceDriftRecord[];
  trend: { generatedAt: string; ece: number; brier: number }[];
}

/** A single calibration view: one snapshot with its reliability curves and (optionally) its Brier score + drift. */
export interface CalibrationView {
  snapshot: HsinCalibrationSnapshotRecord;
  curves: HsinReliabilityCurveRecord[];
  brier?: HsinBrierScoreRecord;
  drift?: HsinConfidenceDriftRecord;
}

/** The trust dashboard: trust rows across sources, narratives, forecasts, and decisions. */
export interface TrustDashboardData {
  sources: HsinSourceTrustRecord[];
  narratives: HsinNarrativeTrustRecord[];
  forecasts: HsinForecastTrustRecord[];
  decisions: HsinDecisionTrustRecord[];
}

/** A single trust view for one entity: its current score/band, history, explanation, limitations, and override state. */
export interface TrustView {
  entityType: TrustEntityType;
  entityId: string;
  /** 0..100 trust score. */
  trustScore: number;
  band: TrustBand;
  history: { trustScore: number; at: string }[];
  explanation: string[];
  limitations: string[];
  overridden: boolean;
  overrideReason?: string;
}

/** Headline calibration/trust callouts surfaced on the dashboard. */
export interface CalibrationHighlights {
  /** Latest Expected Calibration Error. */
  ece?: number;
  /** Latest Brier score. */
  brier?: number;
  driftKind?: ConfidenceDriftKind;
  /** Average trust score across tracked entities. */
  avgTrust?: number;
}

// =============================================================================
// Public Trust, Recalibration & Intelligence Governance — Phase 17
//
// Serializable mirrors of the Phase 17 persistence (migration 0021): the
// TRUST-HISTORY layer (append-only trust snapshots + detected drift), the
// RECALIBRATION-GOVERNANCE layer (proposals + their review decisions + the
// applied override trail), and the TRUST-PUBLICATION layer (trust attached to
// published intelligence) — plus the view-models that back the trust history,
// public trust, proposals, proposal detail, and drift dashboards. The
// OutcomeAlertType union (Phase 15, above) is EXTENDED in place with the four
// Phase-17 alert types.
//
// Where Phase 16 MEASURES trust, Phase 17 tracks how trust EVOLVES, detects
// drift, recommends recalibration (proposal only), routes it through governance,
// and surfaces trust transparently — every score explainable, auditable,
// reproducible, governed, and historically traceable.
// =============================================================================

/** How an entity's trust is trending over its history. Mirrors the trust-history engine. */
export type TrustTrend = 'improving' | 'stable' | 'degrading' | 'volatile';

/** The kind of trust drift detected. Mirrors hsin_trust_drift.drift_kind. */
export type TrustDriftKind =
  | 'collapse'
  | 'degradation'
  | 'instability'
  | 'overconfidence'
  | 'underconfidence'
  | 'stable';

/** Advisory severity for a drift event / proposal. */
export type TrustSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** What prompted a recalibration proposal. Mirrors hsin_recalibration_proposals.trigger. */
export type RecalibrationTrigger =
  | 'trust_drift'
  | 'trust_collapse'
  | 'calibration_error'
  | 'overconfidence'
  | 'underconfidence'
  | 'source_overstated'
  | 'manual';

/** The lifecycle status of a recalibration proposal. */
export type ProposalStatus = 'pending' | 'approved' | 'rejected';

/** The direction a recalibration moves confidence. */
export type RecalibrationDirection = 'downward' | 'upward' | 'none';

/** The kind of intelligence report a trust publication is attached to. */
export type TrustReportType =
  | 'research'
  | 'evidence'
  | 'decision'
  | 'forecast'
  | 'simulation';

/** One APPEND-ONLY trust snapshot. Mirrors the `hsin_trust_history` table. */
export interface HsinTrustHistoryRecord {
  id: string;
  entity_type?: TrustEntityType;
  entity_id?: string;
  /** 0..100 trust score at the snapshot moment. */
  trust_score?: number;
  /** 0..1 confidence behind the score. */
  confidence?: number;
  calibration_score?: number;
  evidence_count?: number;
  band?: TrustBand;
  snapshot_at?: string;
  /** Optional raw signal snapshot (jsonb). */
  source_snapshot?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
}

/** A detected trust-drift event. Mirrors the `hsin_trust_drift` table. */
export interface HsinTrustDriftRecord {
  id: string;
  entity_type?: TrustEntityType;
  entity_id?: string;
  drift_kind?: TrustDriftKind;
  severity?: TrustSeverity;
  magnitude?: number;
  current_trust?: number;
  baseline_trust?: number;
  reason?: string;
  /** The numbers behind the detection (jsonb string[]). */
  evidence?: Record<string, unknown> | string[];
  recommendation?: string;
  detected_at?: string;
  created_at: string;
}

/** A recommended confidence recalibration. Mirrors the `hsin_recalibration_proposals` table. */
export interface HsinRecalibrationProposalRecord {
  id: string;
  entity_type?: TrustEntityType;
  entity_id?: string;
  trigger?: RecalibrationTrigger;
  /** 0..1 current stated confidence. */
  current_confidence?: number;
  /** 0..1 recommended confidence. */
  recommended_confidence?: number;
  current_trust?: number;
  recommended_trust?: number;
  direction?: RecalibrationDirection;
  magnitude?: number;
  severity?: TrustSeverity;
  reason?: string;
  /** Supporting evidence (jsonb string[]). */
  supporting_evidence?: Record<string, unknown> | string[];
  status?: ProposalStatus;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A governance decision over a proposal. Mirrors the `hsin_recalibration_reviews` table. */
export interface HsinRecalibrationReviewRecord {
  id: string;
  proposal_id?: string;
  reviewer_id?: string;
  decision?: 'approved' | 'rejected';
  reason?: string;
  valid?: boolean;
  checks?: Record<string, unknown>;
  previous_state?: Record<string, unknown>;
  new_state?: Record<string, unknown>;
  reversible?: boolean;
  audit_trail?: Record<string, unknown> | string[];
  created_at: string;
}

/** An applied trust change. Mirrors the `hsin_trust_overrides` table. */
export interface HsinTrustOverrideRecord {
  id: string;
  entity_type?: TrustEntityType;
  entity_id?: string;
  previous_score?: number;
  new_score?: number;
  previous_band?: TrustBand;
  new_band?: TrustBand;
  reason?: string;
  proposal_id?: string;
  reversible?: boolean;
  overridden_by?: string;
  created_at: string;
}

/** Trust attached to a published report. Mirrors the `hsin_trust_publications` table. */
export interface HsinTrustPublicationRecord {
  id: string;
  entity_type?: TrustEntityType;
  entity_id?: string;
  report_type?: TrustReportType;
  /** 0..1 stated confidence. */
  confidence?: number;
  /** 0..1 calibrated reliability. */
  calibrated_reliability?: number;
  /** 0..100 trust score. */
  trust_score?: number;
  /** Trust provenance (jsonb). */
  provenance?: Record<string, unknown>;
  published_by?: string;
  published_at?: string;
  created_at: string;
}

/** One enumerated factor behind a trust score (serializable provenance). */
export interface TrustProvenanceFactorView {
  name: string;
  value: number;
  weight: number;
  contribution: number;
  present: boolean;
  detail: string;
}

/** A serializable trust EXPLANATION (provenance). Mirrors the engine TrustExplanation. */
export interface TrustProvenanceView {
  entityType: TrustEntityType;
  entityId: string;
  score: number;
  band: TrustBand;
  factors: TrustProvenanceFactorView[];
  weights: Record<string, number>;
  limitations: string[];
  history: { trustScore: number; at: string }[];
  trend?: {
    trend: TrustTrend;
    delta: number;
    slope: number;
    mean: number;
    volatility: number;
    sampleCount: number;
    explanation: string;
  };
  summary: string;
  generatedAt: string;
}

/** A single entity's trust-history view: its snapshots, trend, and latest drift. */
export interface TrustHistoryView {
  entityType: TrustEntityType;
  entityId: string;
  snapshots: HsinTrustHistoryRecord[];
  trend?: {
    trend: TrustTrend;
    delta: number;
    slope: number;
    mean: number;
    volatility: number;
    sampleCount: number;
    first: number;
    last: number;
    explanation: string;
    limitations: string[];
  };
  drift?: HsinTrustDriftRecord;
  provenance?: TrustProvenanceView;
}

/** One row of the trust-history dashboard: an entity + its latest score, trend, and sparkline. */
export interface TrustHistoryRow {
  entityType: TrustEntityType;
  entityId: string;
  latestScore: number;
  band: TrustBand;
  trend: TrustTrend;
  delta: number;
  snapshotCount: number;
  sparkline: { trustScore: number; at: string }[];
  lastUpdated?: string;
}

/** The trust-history dashboard: per-entity rows + the drift timeline. */
export interface TrustHistoryDashboardData {
  rows: TrustHistoryRow[];
  drift: HsinTrustDriftRecord[];
  /** Counts of each trend across all rows. */
  trendCounts: Record<TrustTrend, number>;
}

/** One entry on the PUBLIC trust surface (transparent, no black-box scores). */
export interface PublicTrustEntry {
  entityType: TrustEntityType;
  entityId: string;
  /** 0..100 trust score. */
  trustScore: number;
  band: TrustBand;
  /** 0..1 reliability (calibration-derived). */
  reliability: number;
  /** 0..1 calibration quality. */
  calibrationQuality: number;
  /** 0..1 outcome accuracy. */
  outcomeAccuracy: number;
  /** 0..1 evidence quality. */
  evidenceQuality: number;
  /** Count of governance actions in this entity's history. */
  governanceHistoryCount: number;
  trend?: TrustTrend;
  provenance?: TrustProvenanceView;
}

/** The public trust surface: every entity, transparently. */
export interface PublicTrustData {
  entries: PublicTrustEntry[];
}

/** The recalibration proposal queue. */
export interface RecalibrationQueueData {
  proposals: HsinRecalibrationProposalRecord[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

/** A single recalibration proposal with its review summary + decision history. */
export interface RecalibrationProposalView {
  proposal: HsinRecalibrationProposalRecord;
  /** Non-mutating review summary (validity + checks + guidance). */
  review: {
    valid: boolean;
    direction: RecalibrationDirection;
    confidenceDelta: number;
    severity: TrustSeverity;
    checks: { label: string; ok: boolean; detail: string }[];
    recommendation: string;
    summary: string;
  };
  /** The append-only governance decisions over this proposal. */
  reviews: HsinRecalibrationReviewRecord[];
}

/** The trust-drift dashboard: drift events + breakdowns. */
export interface TrustDriftDashboardData {
  events: HsinTrustDriftRecord[];
  bySeverity: Record<TrustSeverity, number>;
  byKind: Record<TrustDriftKind, number>;
}

/** Headline Phase-17 trust-governance callouts. */
export interface TrustGovernanceHighlights {
  /** Entities whose trust is degrading or collapsing. */
  degradingCount?: number;
  /** Open (pending) recalibration proposals. */
  pendingProposals?: number;
  /** Drift events in the most recent scan. */
  driftEvents?: number;
  /** Average trust score across tracked entities. */
  avgTrust?: number;
}

// =============================================================================
// Autonomous Research Orchestration & Intelligence Operations Center — Phase 18
//
// Serializable mirrors of the Phase 18 persistence (migration 0022): research
// runs + their append-only transition events + agent tasks, the durable priority
// queue, proposed opportunities, escalations, agent assignments, and workflow
// templates — plus the view-models that back the operations center, runs list,
// run replay, health, opportunities, and escalations dashboards.
//
// The Intelligence Operations Center COORDINATES the Phase 1-17 engines. It is
// NOT AGI: opportunities/escalations/overrides remain human-approved, auditable,
// and reversible; nothing is auto-published or auto-acted.
// =============================================================================

/** A research-run lifecycle state. Mirrors the orchestrator state machine. */
export type ResearchRunState =
  | 'CREATED' | 'QUEUED' | 'DISCOVERING' | 'COLLECTING' | 'ANALYZING' | 'REASONING'
  | 'EVIDENCING' | 'TEMPORAL' | 'CAUSAL' | 'COUNTERFACTUAL' | 'DECISION' | 'OUTCOME'
  | 'CALIBRATION' | 'TRUST' | 'GOVERNANCE' | 'COMPLETE' | 'FAILED' | 'ESCALATED';

/** Queue priority. */
export type ResearchPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

/** Queue item status. */
export type ResearchQueueStatus =
  | 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' | 'retrying';

/** The eight specialised research agents. */
export type ResearchAgentType =
  | 'research' | 'evidence' | 'temporal' | 'causal'
  | 'counterfactual' | 'decision' | 'outcome' | 'trust';

/** An agent task state. */
export type ResearchTaskState = 'pending' | 'active' | 'completed' | 'failed' | 'blocked';

/** Where a discovered opportunity came from. */
export type OpportunitySource =
  | 'signal' | 'evidence' | 'alert' | 'trust_drift' | 'outcome_failure' | 'narrative_spike';

/** What triggered an escalation. */
export type EscalationTrigger =
  | 'repeated_failures' | 'trust_collapse' | 'calibration_drift'
  | 'missing_evidence' | 'governance_backlog' | 'queue_blockage';

/** Escalation / health severity. */
export type EscalationSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

/** The ten monitored engines. */
export type EngineName =
  | 'research' | 'evidence' | 'temporal' | 'causal' | 'counterfactual'
  | 'decision' | 'outcome' | 'calibration' | 'trust' | 'governance';

/** Engine / agent health status. */
export type EngineHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

/** A research run. Mirrors the hsin_research_runs table. */
export interface HsinResearchRunRecord {
  id: string;
  title?: string;
  state?: ResearchRunState;
  priority?: ResearchPriority;
  workflow_key?: string;
  opportunity_id?: string;
  assigned_agents?: Record<string, unknown> | string[];
  evidence_count?: number;
  confidence?: number;
  trust_score?: number;
  outcome_status?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** An append-only research-run transition event. Mirrors hsin_research_run_events. */
export interface HsinResearchRunEventRecord {
  id: string;
  run_id?: string;
  from_state?: string;
  to_state?: string;
  actor?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  at?: string;
  created_at: string;
}

/** An agent task. Mirrors hsin_research_tasks. */
export interface HsinResearchTaskRecord {
  id: string;
  run_id?: string;
  task_key?: string;
  agent_type?: ResearchAgentType;
  stage?: string;
  state?: ResearchTaskState;
  attempts?: number;
  max_attempts?: number;
  runtime_ms?: number;
  last_error?: string;
  created_at: string;
  updated_at?: string;
}

/** A durable queue item. Mirrors hsin_research_queue. */
export interface HsinResearchQueueRecord {
  id: string;
  run_id?: string;
  priority?: ResearchPriority;
  status?: ResearchQueueStatus;
  attempts?: number;
  max_attempts?: number;
  available_at?: string;
  enqueued_at?: string;
  last_error?: string;
  payload?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

/** A proposed research opportunity. Mirrors hsin_research_opportunities. */
export interface HsinResearchOpportunityRecord {
  id: string;
  title?: string;
  reason?: string;
  confidence?: number;
  priority?: ResearchPriority;
  source?: OpportunitySource;
  entity_id?: string;
  status?: 'proposed' | 'accepted' | 'rejected';
  reviewed_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A research escalation. Mirrors hsin_research_escalations. */
export interface HsinResearchEscalationRecord {
  id: string;
  run_id?: string;
  trigger?: EscalationTrigger;
  severity?: EscalationSeverity;
  reason?: string;
  evidence?: Record<string, unknown> | string[];
  recommendation?: string;
  status?: 'open' | 'acknowledged' | 'resolved';
  resolved_by?: string;
  resolution?: string;
  created_at: string;
  updated_at?: string;
}

/** An agent assignment. Mirrors hsin_agent_assignments. */
export interface HsinAgentAssignmentRecord {
  id: string;
  run_id?: string;
  task_id?: string;
  agent_type?: ResearchAgentType;
  stage?: string;
  assigned_at?: string;
  created_at: string;
}

/** A workflow template. Mirrors hsin_workflow_templates. */
export interface HsinWorkflowTemplateRecord {
  id: string;
  template_key?: string;
  name?: string;
  description?: string;
  stages?: Record<string, unknown> | string[];
  required_agents?: Record<string, unknown> | string[];
  required_evidence?: number;
  governance_required?: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** One engine health snapshot (view-model). */
export interface EngineHealthView {
  engine: EngineName;
  status: EngineHealthStatus;
  lastRun?: string;
  successRate: number;
  failureRate: number;
  queueDepth: number;
  detail: string;
}

/** Per-agent performance rollup (view-model). */
export interface AgentPerformanceView {
  agentType: ResearchAgentType;
  status: EngineHealthStatus;
  active: number;
  completed: number;
  failed: number;
  blocked: number;
  avgRuntimeMs: number;
  successRate: number;
}

/** The operations center dashboard: every widget in one payload. */
export interface OperationsDashboardData {
  runsByState: Record<string, number>;
  activeRuns: HsinResearchRunRecord[];
  queue: HsinResearchQueueRecord[];
  queueDepth: number;
  opportunities: HsinResearchOpportunityRecord[];
  escalations: HsinResearchEscalationRecord[];
  health: EngineHealthView[];
  overallStatus: EngineHealthStatus;
  agentPerformance: AgentPerformanceView[];
  recentFailures: HsinResearchRunRecord[];
  governanceBacklog: number;
  avgTrust?: number;
}

/** The runs list dashboard. */
export interface ResearchRunsData {
  runs: HsinResearchRunRecord[];
  byState: Record<string, number>;
}

/** A single research run replay: run + event timeline + tasks + assignments. */
export interface ResearchRunReplayData {
  run: HsinResearchRunRecord;
  events: HsinResearchRunEventRecord[];
  tasks: HsinResearchTaskRecord[];
  assignments: HsinAgentAssignmentRecord[];
  escalations: HsinResearchEscalationRecord[];
  queue?: HsinResearchQueueRecord;
  progress: number;
}

/** The health dashboard. */
export interface PlatformHealthData {
  health: EngineHealthView[];
  overallStatus: EngineHealthStatus;
  agentPerformance: AgentPerformanceView[];
}

/** The opportunities dashboard. */
export interface OpportunitiesData {
  opportunities: HsinResearchOpportunityRecord[];
  proposedCount: number;
  acceptedCount: number;
  rejectedCount: number;
}

/** The escalations dashboard. */
export interface EscalationsData {
  escalations: HsinResearchEscalationRecord[];
  bySeverity: Record<EscalationSeverity, number>;
  openCount: number;
}

/** Headline operations callouts. */
export interface OperationsHighlights {
  activeRuns?: number;
  queueDepth?: number;
  openEscalations?: number;
  proposedOpportunities?: number;
  overallStatus?: EngineHealthStatus;
}

// =============================================================================
// Public Intelligence Publishing, Subscriber Network & Distribution — Phase 19
//
// Serializable mirrors of the Phase 19 persistence (migration 0023): the
// PUBLICATION layer (publications + append-only versions/reviews/retractions),
// the SUBSCRIBER layer (subscribers + preferences), and the DISTRIBUTION layer
// (digest runs + distribution events) + topic pages — plus the view-models that
// back the public intelligence portal, a publication page, topic pages, search,
// the subscribe flow, and the publishing dashboard.
//
// Publishing stays human-approved, governed, auditable, and reversible. Only
// PUBLISHED/RETRACTED publications are world-readable; nothing auto-publishes.
// =============================================================================

/** The publication lifecycle state. Mirrors hsin_publications.state. */
export type PublicationState =
  | 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED' | 'RETRACTED';

/** Subscriber tier. */
export type SubscriberType = 'FREE' | 'RESEARCHER' | 'ANALYST' | 'ORGANIZATION';

/** Digest cadence. */
export type DigestFrequency = 'none' | 'daily' | 'weekly';

/** Delivery channel. */
export type DeliveryChannel = 'email' | 'rss' | 'json' | 'webhook';

/** Why a publication was retracted. */
export type RetractionReason =
  | 'evidence_error' | 'trust_collapse' | 'governance_decision' | 'data_quality_issue' | 'methodology_issue';

/** The kinds of change a digest surfaces. */
export type DigestItemKind =
  | 'new_report' | 'updated_report' | 'trust_change' | 'governance_action'
  | 'research_opportunity' | 'escalation' | 'outcome_change';

/** A publication. Mirrors hsin_publications. */
export interface HsinPublicationRecord {
  id: string;
  slug?: string;
  title?: string;
  summary?: string;
  state?: PublicationState;
  run_id?: string;
  trust_score?: number;
  confidence?: number;
  evidence_count?: number;
  source_count?: number;
  categories?: Record<string, unknown> | string[];
  topics?: Record<string, unknown> | string[];
  review_status?: string;
  governance_status?: string;
  body?: Record<string, unknown>;
  published_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** An append-only publication version/transition. Mirrors hsin_publication_versions. */
export interface HsinPublicationVersionRecord {
  id: string;
  publication_id?: string;
  version?: number;
  from_state?: string;
  to_state?: string;
  actor?: string;
  reason?: string;
  snapshot?: Record<string, unknown>;
  at?: string;
  created_at: string;
}

/** A governance publish-review decision. Mirrors hsin_publication_reviews. */
export interface HsinPublicationReviewRecord {
  id: string;
  publication_id?: string;
  reviewer_id?: string;
  decision?: 'approved' | 'rejected';
  reason?: string;
  gate?: Record<string, unknown>;
  created_at: string;
}

/** A retraction record. Mirrors hsin_publication_retractions. */
export interface HsinPublicationRetractionRecord {
  id: string;
  publication_id?: string;
  reason?: RetractionReason;
  detail?: string;
  previous_state?: string;
  retracted_by?: string;
  created_at: string;
}

/** A subscriber. Mirrors hsin_subscribers. */
export interface HsinSubscriberRecord {
  id: string;
  user_id?: string;
  email?: string;
  type?: SubscriberType;
  active?: boolean;
  created_at: string;
  updated_at?: string;
}

/** Subscription preferences. Mirrors hsin_subscription_preferences. */
export interface HsinSubscriptionPreferenceRecord {
  id: string;
  subscriber_id?: string;
  digest_frequency?: DigestFrequency;
  topics?: Record<string, unknown> | string[];
  notify_trust_changes?: boolean;
  notify_retractions?: boolean;
  channels?: Record<string, unknown> | string[];
  created_at: string;
  updated_at?: string;
}

/** A digest run. Mirrors hsin_digest_runs. */
export interface HsinDigestRunRecord {
  id: string;
  kind?: 'daily' | 'weekly' | 'topic';
  topic?: string;
  title?: string;
  period_start?: string;
  period_end?: string;
  item_count?: number;
  dropped_no_source?: number;
  items?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

/** A distribution event. Mirrors hsin_distribution_events. */
export interface HsinDistributionEventRecord {
  id: string;
  digest_run_id?: string;
  subscriber_id?: string;
  channel?: DeliveryChannel;
  kind?: 'digest' | 'feed' | 'webhook';
  ref?: string;
  item_count?: number;
  status?: 'planned' | 'sent' | 'failed';
  created_at: string;
  updated_at?: string;
}

/** A public topic page. Mirrors hsin_topic_pages. */
export interface HsinTopicPageRecord {
  id: string;
  slug?: string;
  title?: string;
  description?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** One section of a public report (mirrors the publishing-engine ReportSection). */
export interface ReportSectionView {
  key: string;
  title: string;
  body: string;
  items?: string[];
  sourced: boolean;
}

/** A public intelligence list item (portal card). */
export interface PublicIntelligenceItem {
  slug: string;
  title: string;
  summary: string;
  state: PublicationState;
  trustScore?: number;
  confidence?: number;
  evidenceCount: number;
  sourceCount: number;
  reviewStatus?: string;
  governanceStatus?: string;
  publishedAt?: string;
  categories: string[];
  topics: string[];
}

/** The public intelligence portal (/intelligence). */
export interface PublicIntelligenceData {
  items: PublicIntelligenceItem[];
  total: number;
}

/** A single public publication page (/intelligence/[slug]). */
export interface PublicationPageData {
  publication: PublicIntelligenceItem;
  report: ReportSectionView[];
  sourceRefs: string[];
  retraction?: HsinPublicationRetractionRecord;
  trustHistory: { trustScore: number; at: string }[];
  auditTrail: string[];
}

/** A public topic page (/topics/[slug]). */
export interface TopicPageData {
  slug: string;
  title: string;
  description?: string;
  reports: PublicIntelligenceItem[];
  reportCount: number;
  avgTrust?: number;
  evidenceTotal: number;
}

/** Public search results (/search). */
export interface SearchResultsData {
  query: string;
  publications: PublicIntelligenceItem[];
  topics: { slug: string; title: string }[];
  total: number;
}

/** The publishing dashboard (/dashboard/publishing). */
export interface PublishingDashboardData {
  drafts: HsinPublicationRecord[];
  reviewQueue: HsinPublicationRecord[];
  publishingQueue: HsinPublicationRecord[];
  published: HsinPublicationRecord[];
  retractions: HsinPublicationRetractionRecord[];
  digestRuns: HsinDigestRunRecord[];
  subscriberCount: number;
  byState: Record<string, number>;
  analytics: {
    totalPublished: number;
    totalRetracted: number;
    totalSubscribers: number;
    totalDistributions: number;
  };
}

/** The review queue view (/dashboard/publishing/review). */
export interface PublishingReviewData {
  reviewQueue: HsinPublicationRecord[];
  approved: HsinPublicationRecord[];
}

/** A single subscriber's account view (/account/subscriptions). */
export interface SubscriptionAccountData {
  subscriber?: HsinSubscriberRecord;
  preferences?: HsinSubscriptionPreferenceRecord;
  recentDigests: HsinDigestRunRecord[];
}

/** Headline publishing callouts. */
export interface PublishingHighlights {
  published?: number;
  inReview?: number;
  drafts?: number;
  retractions?: number;
  subscribers?: number;
}

// =============================================================================
// Collective Intelligence Network, Peer Review & Consensus Engine — Phase 20
//
// Serializable mirrors of the Phase 20 persistence (migration 0024): the
// COLLABORATION layer (investigations + findings + challenges + alternative
// narratives + endorsements + evidence claims/reviews), the CONSENSUS layer
// (append-only snapshots + governance reviews), and the CONTRIBUTOR reputation
// layer — plus the view-models for the investigations, consensus, contributors,
// and debates dashboards. Weighted consensus is a CANDIDATE, never truth; every
// acceptance is a human governance decision.
// =============================================================================

/** Investigation lifecycle state. Mirrors hsin_investigations.state. */
export type InvestigationState =
  | 'DRAFT' | 'ACTIVE' | 'UNDER_REVIEW' | 'CONSENSUS_FORMING' | 'PUBLISHED' | 'ARCHIVED';

/** Challenge status. */
export type ChallengeStatus = 'open' | 'upheld' | 'rejected';

/** Governance decision over a forming consensus. */
export type ConsensusDecision = 'approved' | 'rejected' | 'escalated' | 'archived';

/** An investigation. Mirrors hsin_investigations. */
export interface HsinInvestigationRecord {
  id: string;
  slug?: string;
  title?: string;
  question?: string;
  state?: InvestigationState;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A finding. Mirrors hsin_findings. */
export interface HsinFindingRecord {
  id: string;
  investigation_id?: string;
  contributor_id?: string;
  position?: string;
  summary?: string;
  confidence?: number;
  evidence_refs?: Record<string, unknown> | string[];
  endorsements?: number;
  created_at: string;
  updated_at?: string;
}

/** A challenge. Mirrors hsin_challenges. */
export interface HsinChallengeRecord {
  id: string;
  investigation_id?: string;
  target_finding_id?: string;
  contributor_id?: string;
  reason?: string;
  status?: ChallengeStatus;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at?: string;
}

/** An alternative narrative. Mirrors hsin_alternative_narratives. */
export interface HsinAlternativeNarrativeRecord {
  id: string;
  investigation_id?: string;
  contributor_id?: string;
  title?: string;
  summary?: string;
  position?: string;
  created_at: string;
  updated_at?: string;
}

/** An endorsement. Mirrors hsin_endorsements. */
export interface HsinEndorsementRecord {
  id: string;
  finding_id?: string;
  contributor_id?: string;
  withdrawn?: boolean;
  created_at: string;
  updated_at?: string;
}

/** An evidence claim. Mirrors hsin_evidence_claims. */
export interface HsinEvidenceClaimRecord {
  id: string;
  investigation_id?: string;
  contributor_id?: string;
  claim?: string;
  source_ref?: string;
  source_quality?: number;
  support_count?: number;
  challenge_count?: number;
  reviews_approved?: number;
  reviews_rejected?: number;
  strength?: number;
  created_at: string;
  updated_at?: string;
}

/** An evidence review. Mirrors hsin_evidence_reviews. */
export interface HsinEvidenceReviewRecord {
  id: string;
  evidence_claim_id?: string;
  reviewer_id?: string;
  decision?: 'approved' | 'rejected';
  reason?: string;
  created_at: string;
}

/** A consensus snapshot. Mirrors hsin_consensus_snapshots. */
export interface HsinConsensusSnapshotRecord {
  id: string;
  investigation_id?: string;
  consensus_position?: string;
  agreement_score?: number;
  evidence_strength?: number;
  confidence?: number;
  positions?: Record<string, unknown> | unknown[];
  dissent_positions?: Record<string, unknown> | unknown[];
  confidence_distribution?: Record<string, unknown> | unknown[];
  sample_count?: number;
  contributor_count?: number;
  explanation?: Record<string, unknown> | string[];
  limitations?: Record<string, unknown> | string[];
  generated_at?: string;
  created_at: string;
}

/** A consensus governance review. Mirrors hsin_consensus_reviews. */
export interface HsinConsensusReviewRecord {
  id: string;
  investigation_id?: string;
  snapshot_id?: string;
  reviewer_id?: string;
  decision?: ConsensusDecision;
  reason?: string;
  consensus_position?: string;
  agreement_score?: number;
  resulting_state?: string;
  created_at: string;
}

/** A contributor score. Mirrors hsin_contributor_scores. */
export interface HsinContributorScoreRecord {
  id: string;
  contributor_id?: string;
  accuracy?: number;
  trust?: number;
  review_quality?: number;
  consensus_alignment?: number;
  evidence_quality?: number;
  overall?: number;
  explanation?: Record<string, unknown> | string[];
  limitations?: Record<string, unknown> | string[];
  computed_at?: string;
  created_at: string;
  updated_at?: string;
}

/** One row of the investigations board. */
export interface InvestigationBoardRow {
  id: string;
  slug: string;
  title: string;
  question: string;
  state: InvestigationState;
  findingCount: number;
  challengeCount: number;
  contributorCount: number;
  contentiousness: number;
  consensusPosition?: string;
  agreementScore?: number;
  updatedAt?: string;
}

/** The investigations dashboard. */
export interface InvestigationsBoardData {
  rows: InvestigationBoardRow[];
  byState: Record<string, number>;
}

/** A single investigation detail view. */
export interface InvestigationDetailData {
  investigation: HsinInvestigationRecord;
  findings: HsinFindingRecord[];
  challenges: HsinChallengeRecord[];
  alternatives: HsinAlternativeNarrativeRecord[];
  evidenceClaims: HsinEvidenceClaimRecord[];
  snapshot?: HsinConsensusSnapshotRecord;
  metrics: {
    findingCount: number;
    challengeCount: number;
    openChallengeCount: number;
    alternativeCount: number;
    endorsementCount: number;
    contributorCount: number;
    contentiousness: number;
    activityScore: number;
  };
  progress: number;
}

/** The consensus dashboard (list). */
export interface ConsensusBoardData {
  snapshots: HsinConsensusSnapshotRecord[];
  reviews: HsinConsensusReviewRecord[];
}

/** A single consensus detail view. */
export interface ConsensusDetailData {
  investigation: HsinInvestigationRecord;
  snapshot?: HsinConsensusSnapshotRecord;
  reviews: HsinConsensusReviewRecord[];
}

/** The contributors leaderboard. */
export interface ContributorsBoardData {
  scores: HsinContributorScoreRecord[];
}

/** The debates dashboard (evidence under contention). */
export interface DebatesBoardData {
  claims: HsinEvidenceClaimRecord[];
  challenges: HsinChallengeRecord[];
}

/** Headline collective-intelligence callouts (operations strip). */
export interface CollectiveHighlights {
  activeInvestigations?: number;
  consensusForming?: number;
  majorDisputes?: number;
  pendingGovernance?: number;
  highTrustContributors?: number;
  highImpactInvestigations?: number;
}

// =============================================================================
// Forecasting, Scenario Planning & Early Warning — Phase 21
//
// Serializable mirrors of the Phase 21 persistence (migration 0025): the FORECAST
// layer (forecasts + versions + outcomes + accuracy + alerts), the SCENARIO layer
// (scenarios + versions + comparisons + trees), and the EARLY-WARNING layer —
// plus the view-models for the forecasts, scenarios, and warnings dashboards.
// Every forecast is a HYPOTHESIS; alerts are advisory; nothing auto-acts.
// =============================================================================

/** Forecast lifecycle status. */
export type ForecastStatus = 'active' | 'monitoring' | 'confirmed' | 'failed' | 'expired';
/** Scenario lifecycle state. */
export type ScenarioState = 'EMERGING' | 'ACTIVE' | 'MONITORING' | 'CONFIRMED' | 'INVALIDATED' | 'ARCHIVED';
/** Early-warning level. */
export type WarningLevel = 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL';
/** Early-warning kind. */
export type WarningKind =
  | 'emerging_pattern' | 'signal_acceleration' | 'trust_collapse'
  | 'narrative_shift' | 'consensus_instability' | 'forecast_risk';
/** Forecast alert type. */
export type ForecastAlertType = 'forecast_failure' | 'forecast_risk' | 'forecast_drift';

/** A forecast. Mirrors hsin_forecasts. */
export interface HsinForecastRecord {
  id: string;
  prediction?: string;
  confidence?: number;
  reliability?: number;
  status?: ForecastStatus;
  horizon?: string;
  supporting_signals?: Record<string, unknown> | unknown[];
  assumptions?: Record<string, unknown> | string[];
  invalidation_criteria?: Record<string, unknown> | string[];
  limitations?: Record<string, unknown> | string[];
  version?: number;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** An append-only forecast version. Mirrors hsin_forecast_versions. */
export interface HsinForecastVersionRecord {
  id: string;
  forecast_id?: string;
  version?: number;
  prediction?: string;
  confidence?: number;
  reliability?: number;
  status?: string;
  actor?: string;
  reason?: string;
  snapshot?: Record<string, unknown>;
  at?: string;
  created_at: string;
}

/** A forecast outcome. Mirrors hsin_forecast_outcomes. */
export interface HsinForecastOutcomeRecord {
  id: string;
  forecast_id?: string;
  confidence?: number;
  success?: number;
  observation?: string;
  observed_at?: string;
  created_at: string;
}

/** A forecast accuracy rollup (Phase 21). Mirrors hsin_forecast_accuracy. */
export interface HsinForecastReliabilityRecord {
  id: string;
  scope?: string;
  success_rate?: number;
  failure_rate?: number;
  ece?: number;
  brier_score?: number;
  drift?: number;
  sample_count?: number;
  bins?: Record<string, unknown> | unknown[];
  computed_at?: string;
  created_at: string;
  updated_at?: string;
}

/** A forecast alert. Mirrors hsin_forecast_alerts. */
export interface HsinForecastAlertRecord {
  id: string;
  forecast_id?: string;
  alert_type?: ForecastAlertType;
  severity?: WarningLevel;
  reason?: string;
  evidence?: Record<string, unknown> | string[];
  status?: 'open' | 'acknowledged' | 'resolved';
  resolved_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A scenario. Mirrors hsin_scenarios. */
export interface HsinScenarioRecord {
  id: string;
  slug?: string;
  title?: string;
  description?: string;
  state?: ScenarioState;
  likelihood?: number;
  drivers?: Record<string, unknown> | unknown[];
  forecast_ids?: Record<string, unknown> | string[];
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** An append-only scenario version. Mirrors hsin_scenario_versions. */
export interface HsinScenarioVersionRecord {
  id: string;
  scenario_id?: string;
  from_state?: string;
  to_state?: string;
  actor?: string;
  reason?: string;
  likelihood?: number;
  at?: string;
  created_at: string;
}

/** A scenario comparison snapshot (Phase 21). Mirrors hsin_scenario_comparisons. */
export interface HsinScenarioComparisonSnapshotRecord {
  id: string;
  leading?: string;
  divergence?: number;
  ranked?: Record<string, unknown> | unknown[];
  summary?: string;
  limitations?: Record<string, unknown> | string[];
  compared_at?: string;
  created_at: string;
}

/** A scenario tree. Mirrors hsin_scenario_trees. */
export interface HsinScenarioTreeRecord {
  id: string;
  scenario_id?: string;
  title?: string;
  tree?: Record<string, unknown>;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** An early-warning alert. Mirrors hsin_early_warning_alerts. */
export interface HsinEarlyWarningAlertRecord {
  id: string;
  kind?: WarningKind;
  level?: WarningLevel;
  title?: string;
  signal?: string;
  evidence?: Record<string, unknown> | string[];
  recommendation?: string;
  entity_id?: string;
  status?: 'open' | 'acknowledged' | 'resolved';
  resolved_by?: string;
  detected_at?: string;
  created_at: string;
  updated_at?: string;
}

/** One row of the forecasts board. */
export interface ForecastBoardRow {
  id: string;
  prediction: string;
  confidence: number;
  reliability: number;
  status: ForecastStatus;
  horizon?: string;
  signalCount: number;
  updatedAt?: string;
}

/** The forecasts dashboard. */
export interface ForecastsBoardData {
  rows: ForecastBoardRow[];
  byStatus: Record<string, number>;
  accuracy?: HsinForecastReliabilityRecord;
}

/** A single forecast detail (with explanation + outcomes + versions + alerts). */
export interface ForecastDetailData {
  forecast: HsinForecastRecord;
  explanation: {
    factors: { label: string; contribution: number; strength: number; direction: number }[];
    assumptions: string[];
    invalidationCriteria: string[];
    limitations: string[];
    summary: string;
  };
  outcomes: HsinForecastOutcomeRecord[];
  versions: HsinForecastVersionRecord[];
  alerts: HsinForecastAlertRecord[];
}

/** The scenarios dashboard. */
export interface ScenariosBoardData {
  scenarios: HsinScenarioRecord[];
  byState: Record<string, number>;
  comparison?: HsinScenarioComparisonSnapshotRecord;
}

/** A single scenario detail (with tree + versions). */
export interface ScenarioDetailData {
  scenario: HsinScenarioRecord;
  tree?: HsinScenarioTreeRecord;
  versions: HsinScenarioVersionRecord[];
  ranked: { id: string; title: string; likelihood: number; rank: number; share: number }[];
}

/** The warnings dashboard. */
export interface WarningsBoardData {
  warnings: HsinEarlyWarningAlertRecord[];
  forecastAlerts: HsinForecastAlertRecord[];
  byLevel: Record<WarningLevel, number>;
}

/** Headline forecasting callouts (operations strip). */
export interface ForecastingHighlights {
  activeForecasts?: number;
  forecastFailures?: number;
  scenarioShifts?: number;
  warningAlerts?: number;
  forecastAccuracy?: number;
  confidenceDrift?: number;
}

// =============================================================================
// Executive Command Center & Strategic Intelligence OS — Phase 22
//
// Serializable mirrors of the Phase 22 persistence (migration 0026): the COMMAND
// layer that OPERATES Phases 1-21. Snapshots + priorities + briefs + reviews +
// reports + decisions. This phase creates NO new intelligence — it ranks
// attention and surfaces signals. Every record is ADVISORY; every decision is
// HUMAN (reviewer + reason required, reversible, audit-logged). Nothing auto-acts.
// =============================================================================

/** Executive attention / priority bucket. Mirrors @hsi/executive-intelligence AttentionLevel. */
export type ExecutiveAttentionLevel = 'routine' | 'notable' | 'elevated' | 'urgent';
/** The kind of thing an executive priority points at. */
export type ExecutivePriorityKind =
  | 'risk' | 'opportunity' | 'investigation' | 'forecast'
  | 'warning' | 'governance' | 'consensus' | 'trust';
/** Executive severity for risks / governance items. */
export type ExecutiveSeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
/** Executive brief kind. */
export type ExecutiveBriefKind = 'daily' | 'weekly' | 'critical' | 'governance' | 'forecast' | 'operations';
/** Executive review lifecycle status. */
export type ExecutiveReviewStatus = 'queued' | 'approved' | 'rejected' | 'archived';
/** Executive decision type. */
export type ExecutiveDecisionKind = 'approved' | 'rejected' | 'archived';

/** A persisted executive snapshot. Mirrors hsin_executive_snapshots. */
export interface HsinExecutiveSnapshotRecord {
  id: string;
  attention_index?: number;
  attention_level?: ExecutiveAttentionLevel | string;
  overall_health?: string;
  executive_summary?: string;
  /** Full ExecutiveSnapshot JSON. */
  snapshot?: Record<string, unknown>;
  priority_count?: number;
  risk_count?: number;
  opportunity_count?: number;
  governance_count?: number;
  limitations?: Record<string, unknown> | string[];
  generated_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A persisted strategic priority. Mirrors hsin_executive_priorities. */
export interface HsinExecutivePriorityRecord {
  id: string;
  snapshot_id?: string;
  ref_id?: string;
  kind?: ExecutivePriorityKind | string;
  title?: string;
  score?: number;
  rank?: number;
  urgency?: number;
  impact?: number;
  attention_level?: ExecutiveAttentionLevel | string;
  recommendation?: string;
  explanation?: Record<string, unknown> | string[];
  limitations?: Record<string, unknown> | string[];
  entity_ref?: string;
  created_at: string;
  updated_at?: string;
}

/** A persisted executive brief. Mirrors hsin_executive_briefs. */
export interface HsinExecutiveBriefRecord {
  id: string;
  kind?: ExecutiveBriefKind | string;
  title?: string;
  headline?: string;
  /** Full BriefSection[] JSON. */
  sections?: Record<string, unknown> | unknown[];
  limitations?: Record<string, unknown> | string[];
  generated_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A persisted executive review-queue item. Mirrors hsin_executive_reviews. */
export interface HsinExecutiveReviewRecord {
  id: string;
  priority_id?: string;
  title?: string;
  kind?: ExecutivePriorityKind | string;
  severity?: ExecutiveSeverityLevel | string;
  status?: ExecutiveReviewStatus | string;
  queued_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A persisted daily intelligence report. Mirrors hsin_executive_reports. */
export interface HsinExecutiveReportRecord {
  id: string;
  snapshot_id?: string;
  title?: string;
  report_date?: string;
  /** Full DailyIntelligenceReport JSON. */
  report?: Record<string, unknown>;
  top_risk_count?: number;
  top_opportunity_count?: number;
  generated_at?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

/** A persisted human executive decision. Mirrors hsin_executive_decisions. */
export interface HsinExecutiveDecisionRecord {
  id: string;
  review_id?: string;
  priority_id?: string;
  decision?: ExecutiveDecisionKind | string;
  reviewer?: string;
  reason?: string;
  previous_status?: string;
  reversible?: boolean;
  audit_trail?: Record<string, unknown> | string[];
  decided_at?: string;
  created_at: string;
  updated_at?: string;
}

/** The executive command-center dashboard view-model. */
export interface ExecutiveCommandData {
  snapshot: HsinExecutiveSnapshotRecord | null;
  priorities: HsinExecutivePriorityRecord[];
  attentionIndex: number;
  attentionLevel: ExecutiveAttentionLevel | string;
  executiveSummary: string;
  riskCount: number;
  opportunityCount: number;
  governanceCount: number;
  panels: {
    forecasts: { active: number; failing: number; avgConfidence: number };
    consensus: { forming: number; disputed: number };
    operations: { health: string; activeRuns: number; escalations: number };
  };
}

/** The priorities board view-model. */
export interface ExecutivePrioritiesData {
  priorities: HsinExecutivePriorityRecord[];
  byKind: Record<string, number>;
  byAttention: Record<string, number>;
}

/** The risks / opportunities board view-models. */
export interface ExecutiveRisksData {
  risks: { id: string; title: string; source: string; severity: ExecutiveSeverityLevel; score: number; recommendation: string }[];
  bySeverity: Record<string, number>;
}
export interface ExecutiveOpportunitiesData {
  opportunities: { id: string; title: string; source: string; score: number; recommendation: string }[];
  bySource: Record<string, number>;
}

/** The briefings view-model. */
export interface ExecutiveBriefingsData {
  briefs: HsinExecutiveBriefRecord[];
  latestDaily: HsinExecutiveBriefRecord | null;
}

/** The executive governance queue view-model. */
export interface ExecutiveGovernanceData {
  reviews: HsinExecutiveReviewRecord[];
  decisions: HsinExecutiveDecisionRecord[];
  byStatus: Record<string, number>;
}

/** Headline executive callouts (operations strip). */
export interface ExecutiveHighlights {
  attentionIndex?: number;
  attentionLevel?: string;
  topPriorities?: number;
  openRisks?: number;
  openOpportunities?: number;
  governancePending?: number;
  dailyBriefReady?: boolean;
}

// =============================================================================
// Human Operations & Case Management OS — Phase 24
//
// Serializable mirrors of the Phase 24 persistence (migration 0027): teams,
// assignments, escalations, workloads, operational alerts, the operations audit
// trail, and beta-tester issues — plus the view-models for the operations
// dashboards. The pure logic lives in @hsi/operations-engine +
// @hsi/performance-engine. Everything operational is ADVISORY: no autonomous
// publication, approval, or governance action.
// =============================================================================

export type OpsTeamKey =
  | 'research' | 'review' | 'curation' | 'governance'
  | 'executive' | 'security' | 'publishing' | 'simulation';
export type OpsLifecycleState =
  | 'SUBMITTED' | 'TRIAGE' | 'RESEARCH' | 'EVIDENCE_COLLECTION'
  | 'REVIEW' | 'PUBLICATION_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
export type OpsCaseRole = 'owner' | 'reviewer' | 'approver' | 'escalation_contact';
export type OpsEscalationLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type OpsAlertKindName =
  | 'investigation_overdue' | 'review_overdue' | 'publication_stalled'
  | 'escalation_pending' | 'workload_imbalance' | 'human_review_required';
export type TesterIssueStateName =
  | 'SUBMITTED' | 'TRIAGED' | 'ASSIGNED' | 'RESOLVED' | 'VERIFIED' | 'CLOSED';

export interface HsinTeamRecord {
  id: string;
  key?: OpsTeamKey | string;
  name?: string;
  description?: string;
  created_at: string;
  updated_at?: string;
}
export interface HsinTeamMemberRecord {
  id: string;
  team_id?: string;
  user_id?: string;
  team_role?: 'member' | 'lead' | string;
  created_at: string;
}
export interface HsinAssignmentRecord {
  id: string;
  case_id?: string;
  case_kind?: string;
  role?: OpsCaseRole | string;
  assignee?: string;
  assigner?: string;
  reason?: string;
  notes?: string;
  assigned_at?: string;
  reassigned_at?: string;
  active?: boolean;
  created_at: string;
  updated_at?: string;
}
export interface HsinAssignmentHistoryRecord {
  id: string;
  case_id?: string;
  role?: string;
  action?: 'assigned' | 'reassigned' | 'unassigned' | string;
  from_user?: string;
  to_user?: string;
  actor?: string;
  reason?: string;
  at?: string;
  created_at: string;
}
export interface HsinWorkloadRecord {
  id: string;
  scope?: 'assignee' | 'team' | string;
  scope_id?: string;
  assigned?: number;
  open_count?: number;
  overdue?: number;
  escalated?: number;
  details?: Record<string, unknown>;
  computed_at?: string;
  created_at: string;
  updated_at?: string;
}
export interface HsinEscalationRecord {
  id: string;
  case_id?: string;
  level?: OpsEscalationLevel | string;
  raised_by?: string;
  reason?: string;
  active?: boolean;
  created_at: string;
  updated_at?: string;
}
export interface HsinOpsAlertRecord {
  id: string;
  kind?: OpsAlertKindName | string;
  severity?: 'info' | 'warning' | 'critical' | string;
  title?: string;
  detail?: string;
  case_id?: string;
  team?: string;
  status?: 'open' | 'acknowledged' | 'resolved' | string;
  created_at: string;
  updated_at?: string;
}
export interface HsinOpsAuditEventRecord {
  id: string;
  event_type?: string;
  case_id?: string;
  actor?: string;
  summary?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  at?: string;
  created_at: string;
}
export interface HsinTesterIssueRecord {
  id: string;
  reference?: string;
  tester?: string;
  title?: string;
  route?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | string;
  state?: TesterIssueStateName | string;
  assignee?: string;
  resolution?: string;
  created_at: string;
  updated_at?: string;
}

// ---- view-models ------------------------------------------------------------

export interface OpsCaseView {
  id: string;
  title: string;
  state: OpsLifecycleState | string;
  team: OpsTeamKey | string;
  assignee: string | null;
  escalation: OpsEscalationLevel | string | null;
  dueAt?: string | null;
  overdue: boolean;
  open: boolean;
}

export interface OpsWorkloadRowView {
  assignee: string;
  assigned: number;
  open: number;
  overdue: number;
  escalated: number;
}
export interface OpsTeamWorkloadView {
  team: OpsTeamKey | string;
  members: number;
  open: number;
  overdue: number;
  escalated: number;
  loadPerMember: number;
  status: 'healthy' | 'busy' | 'overloaded';
}

export interface WorkloadsData {
  byAssignee: OpsWorkloadRowView[];
  byTeam: OpsTeamWorkloadView[];
  totals: { open: number; overdue: number; escalated: number; reviewBacklog: number; publicationBacklog: number };
}

export interface MyWorkData {
  assignedToMe: OpsCaseView[];
  awaitingReview: OpsCaseView[];
  needsEvidence: OpsCaseView[];
  needsApproval: OpsCaseView[];
  escalated: OpsCaseView[];
  completed: OpsCaseView[];
}

export interface TeamsData {
  teams: { key: OpsTeamKey | string; name: string; members: number; open: number; overdue: number; status: string }[];
}

export interface OperationsAlertsData {
  alerts: HsinOpsAlertRecord[];
  bySeverity: Record<string, number>;
}

export interface ExecutiveOperationsData {
  researchBacklog: number;
  reviewBacklog: number;
  publicationQueue: number;
  criticalEscalations: number;
  openInvestigations: number;
  teamCapacity: OpsTeamWorkloadView[];
  forecastedCapacity: { team: string; weeklyCapacity: number; netPerWeek: number; trend: string }[];
  avgResolutionMs: number | null;
  operationalHealth: 'healthy' | 'busy' | 'overloaded';
}

export interface ContributorOpsData {
  active: number;
  trusted: number;
  contributors: { name: string; completed: number; reviewed: number; published: number }[];
}

export interface OperationsCenterData {
  workloads: WorkloadsData;
  alerts: HsinOpsAlertRecord[];
  escalations: HsinEscalationRecord[];
  teamHealth: OpsTeamWorkloadView[];
  openCases: number;
  overdueCases: number;
  criticalEscalations: number;
}

export interface OperationsHighlights {
  openCases?: number;
  overdueCases?: number;
  criticalEscalations?: number;
  reviewBacklog?: number;
  publicationBacklog?: number;
  openAlerts?: number;
}

// =============================================================================
// Identity & Access Management — Phase 24B
//
// View-models for the admin IAM console (users, teams, testers, access logs).
// Role lives in public.user_roles → roles; status on public.users; team in
// public.team_members. All admin-only; every change is audited to
// security_audit_events. No JWT/metadata role storage.
// =============================================================================

export type UserStatus = 'pending' | 'active' | 'suspended' | 'disabled';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  role: string | null; // highest role
  roles: string[];
  team: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersData {
  users: AdminUserRow[];
  roleOptions: string[];
  teamOptions: { key: string; name: string }[];
  counts: { total: number; active: number; pending: number; suspended: number; disabled: number };
}

export interface AdminTeamRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  members: { userId: string; email: string; name: string | null; teamRole: 'member' | 'lead' }[];
  memberCount: number;
}

export interface AdminTeamsData {
  teams: AdminTeamRow[];
  assignableUsers: { id: string; email: string; name: string | null }[];
}

export interface AdminTesterRow {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  team: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  signalsCreated: number;
  reviewsCompleted: number;
  reportsSubmitted: number;
  ready: boolean;
}

export interface AdminTestersData {
  testers: AdminTesterRow[];
}

export interface AdminAccessLogRow {
  id: string;
  userId: string | null;
  email: string | null;
  eventType: string | null;
  severity: string | null;
  route: string | null;
  message: string | null;
  createdAt: string;
}

export interface AdminAccessLogsData {
  events: AdminAccessLogRow[];
  eventTypes: string[];
}

export interface InviteStats {
  totalTesters: number;
  activeTesters: number;
  pendingInvitations: number;
  suspendedUsers: number;
}

// =============================================================================
// Contributor Intelligence Network (Phase 25) — DB row mirrors for migration
// 0029. The pure progression LOGIC + richer view-models live in
// @hsi/contributor-network; these are thin row shapes for the web DAL.
// =============================================================================

export type RoleApplicationStatus =
  | 'pending' | 'approved' | 'rejected' | 'needs_more_info' | 'withdrawn';

export interface RoleApplicationRow {
  id: string;
  userId: string;
  requestedPath: string;
  requestedRole: string | null;
  experienceSummary: string | null;
  reason: string | null;
  organization: string | null;
  status: RoleApplicationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface UserBadgeRow {
  id: string;
  userId: string;
  badgeId: string;
  awardedAt: string;
  earnedByMetric: string | null;
}

export interface UserMissionRow {
  id: string;
  userId: string;
  templateId: string;
  progress: Record<string, number>;
  status: 'not_started' | 'in_progress' | 'completed' | 'expired' | 'claimed';
  deadline: string | null;
  claimedAt: string | null;
}

export type InvestigationWorkflowStatus =
  | 'intake' | 'research' | 'evidence_collection' | 'review'
  | 'escalated' | 'governance' | 'publication_ready' | 'published' | 'archived';

export interface InvestigationRow {
  id: string;
  title: string;
  summary: string | null;
  status: InvestigationWorkflowStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  ownerId: string | null;
  teamId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface InvestigationEventRow {
  id: string;
  investigationId: string;
  actorId: string | null;
  action: string;
  reason: string | null;
  createdAt: string;
}

/** Contribution identity shown on /dashboard/profile (Phase 25 Deliverable 11). */
export interface ContributionIdentity {
  role: string | null;
  rankName: string;
  rankTrack: string;
  xp: number;
  intelCredits: number;
  reputation: Record<string, number>;
  overallReputation: number;
  badges: Array<{ id: string; name: string }>;
  acceptedSignals: number;
  evidencePackages: number;
  reviewsCompleted: number;
  reportsPrepared: number;
  nextRank: { name: string; xpToNext: number; reputationToNext: number; needsAdminApproval: boolean } | null;
  // Phase 26 — live stats (from user_contribution_stats when present).
  xpRank?: string;
  signalsSubmitted?: number;
  publicationsContributed?: number;
  missionsCompleted?: number;
  live?: boolean;
}
