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
