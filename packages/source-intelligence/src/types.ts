// =============================================================================
// @hsi/source-intelligence — domain types (Phase 7: Human Signal Intelligence)
//
// HSI ETHICS (binding on every type & function in this package):
//   * PUBLIC information ONLY. We never scrape behind logins, never enter
//     private communities, never bypass authentication or paywalls.
//   * No doxxing. No harassment. We monitor PUBLIC narratives/ideologies/signals
//     for research & governance — never private individuals.
//   * Nothing here auto-publishes. This engine produces DRAFTS (signals, alerts)
//     for the evidence/governance/review pipeline. A human decides.
//   * Determinism: no Date.now()/Math.random() in pure code — callers inject
//     `now` (and seeds/clocks where needed). Network only via injected fetch,
//     gated, never at import time. Works fully offline via fixtures.
// =============================================================================

/**
 * Kind of source we observe. A curated union for known platforms, but inputs
 * accept any `string` so the registry can expand without a code change.
 */
export type SourceType =
  | 'website'
  | 'rss'
  | 'youtube'
  | 'tiktok'
  | 'podcast'
  | 'forum'
  | 'document'
  | 'manual';

/** Kind of an individual signal/observation captured from a source. */
export type SignalType =
  | 'article'
  | 'video'
  | 'podcast_episode'
  | 'forum_post'
  | 'social_post'
  | 'document'
  | 'manual_submission'
  | 'rss_item';

/**
 * Thematic category of a signal. A curated union of common research themes, but
 * UNLIMITED custom categories are supported — anywhere a category is consumed it
 * is typed as `string`, and the classifier accepts `extraCategories`.
 */
export type SignalCategory =
  | 'ideology'
  | 'movement'
  | 'narrative'
  | 'recruitment'
  | 'propaganda'
  | 'misinformation'
  | 'disinformation'
  | 'collapse'
  | 'extinction'
  | 'population'
  | 'technology'
  | 'religion'
  | 'politics'
  | 'economics'
  | 'civilization'
  | 'other';

/** Kinds of alert the engine can raise (always as a DRAFT, never published). */
export type AlertType =
  | 'new_signal'
  | 'source_changed'
  | 'narrative_shift'
  | 'watchlist_match'
  | 'high_risk_signal'
  | 'review_escalation'
  | 'research_created'
  | 'publication_created';

/** Severity ladder for alerts and watchlists. */
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Input used to register/describe a source in the registry. */
export interface SourceInput {
  name: string;
  description?: string;
  /** Accepts the curated union or any custom string (expandable registry). */
  sourceType: SourceType | string;
  platform?: string;
  homepageUrl?: string;
  rssUrl?: string;
  /** Optional 0..1 prior risk weighting curated by a human researcher. */
  riskLevel?: number;
}

/** A captured document/snapshot (raw is `unknown` — never typed as `any`). */
export interface CapturedDoc {
  sourceId?: string;
  url?: string;
  title?: string;
  metaDescription?: string;
  /** Extracted plain-text body (tags stripped). */
  bodyText: string;
  canonicalUrl?: string;
  /** ISO timestamp — INJECTED by caller, never Date.now() inside pure code. */
  capturedAt: string;
  /** Stable content hash (sha-256 hex, or labeled fnv1a fallback). */
  contentHash: string;
  raw?: unknown;
}

/** Result of a capture attempt. Never throws — failures surface here. */
export interface CaptureResult {
  ok: boolean;
  doc?: CapturedDoc;
  error?: string;
  /** Name of the provider that produced (or attempted) this capture. */
  provider: string;
  /** True when produced from offline fixtures rather than live network. */
  isFixture?: boolean;
}

/** A normalized RSS/Atom item. */
export interface RssItem {
  id: string;
  title: string;
  link?: string;
  summary?: string;
  publishedAt?: string;
  contentHash: string;
}

/** A draft signal (NOT auto-published — feeds the evidence pipeline). */
export interface SignalDraft {
  sourceId?: string;
  title: string;
  summary?: string;
  rawContent?: string;
  contentHash: string;
  signalType: SignalType;
  /** `string` to allow unlimited custom categories. */
  signalCategory: string;
  /** Calibrated confidence 0..1 — uncertainty is preserved, never forced. */
  confidence: number;
  capturedAt: string;
  tags?: string[];
}

/** Outcome of comparing a prior capture to a new one. */
export interface ChangeResult {
  changed: boolean;
  changeType: 'none' | 'new' | 'modified' | 'removed' | 'major';
  beforeHash?: string;
  afterHash?: string;
  /** Lexical similarity 0..1 (1 = identical text). */
  similarity: number;
  /** Human-readable explanation of the change decision. */
  summary: string;
}

/** Output of the deterministic signal classifier. */
export interface Classification {
  signalType: SignalType;
  signalCategory: string;
  /** 0..1 — low when nothing matches strongly (uncertainty preserved). */
  confidence: number;
  /** Runner-up categories with their raw scores, for transparency. */
  alternativeCategories: { category: string; score: number }[];
  /** Explanation of why this classification was chosen. */
  rationale: string;
}

/** A detected shift in a narrative between two snapshots. */
export interface NarrativeDriftEvent {
  before: string;
  after: string;
  explanation: string;
  /** 0..1 confidence that this is a meaningful drift, not noise. */
  confidence: number;
  /** 0..1 magnitude of the drift (1 = wholly different). */
  driftScore: number;
  detectedAt: string;
}

/** Definition of a research watchlist (neutral, public-term oriented). */
export interface WatchlistDef {
  id?: string;
  name: string;
  description?: string;
  severity?: AlertSeverity;
  /** Terms/keywords to match (case-insensitive, word-boundary). */
  terms: string[];
}

/** A single watchlist match against a signal. */
export interface WatchlistMatch {
  watchlistId?: string;
  watchlistName: string;
  matchedTerms: string[];
  /** 0..1 fraction of watchlist terms matched, weighted. */
  score: number;
  severity: AlertSeverity;
}

/** A draft alert. EVERY alert MUST carry an `explanation` (spec). */
export interface AlertDraft {
  signalId?: string;
  sourceId?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  createdAt: string;
}

/** A capture provider. Pluggable, testable, gated by `enabled()`. */
export interface CaptureProvider {
  name: string;
  sourceType: SourceType | string;
  /** Whether this provider may run (e.g. network allowed / fixtures present). */
  enabled(): boolean;
  /** Capture once. Must NOT throw — return { ok: false } on failure. */
  capture(input: { url?: string; rawText?: string; now: string }): Promise<CaptureResult>;
}
