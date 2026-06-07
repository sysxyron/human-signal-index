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
