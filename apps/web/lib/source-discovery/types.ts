// =============================================================================
// HSI Phase 70.3 — Source Import / Discovery / Signal Scout: shared types (PURE).
//
// CSV vocabulary, candidate / duplicate / classification shapes. Everything is
// deterministic and review-gated; nothing here activates or publishes. PURE.
// =============================================================================

export const CANDIDATE_STATUSES = ['pending_review', 'approved', 'rejected', 'needs_changes', 'duplicate', 'archived'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const DUPLICATE_STATUSES = [
  'none', 'exact_duplicate', 'domain_duplicate', 'feed_duplicate', 'related_source',
  // Phase 70.3.1 — platform-aware:
  'platform_identity_duplicate', 'platform_domain_only_not_duplicate',
] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

/** Identity strategy used to compute a candidate's uniqueness key. */
export type IdentityStrategy = 'exact_url' | 'platform_identity' | 'feed_url' | 'domain';

/** Structured CSV validation error codes (Phase 70.3.1 diagnostics). */
export const IMPORT_ERROR_CODES = ['MISSING_REQUIRED_FIELD', 'INVALID_URL', 'UNSUPPORTED_SOURCE_TYPE', 'BAD_RISK_SCORE', 'BAD_INTERVAL'] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];
export interface ImportError { code: ImportErrorCode; reason: string; suggestedFix: string }
/** Serialize an error so it round-trips through a text[] column. */
export function formatError(e: ImportError): string { return `${e.code}: ${e.reason} — Suggested: ${e.suggestedFix}`; }

/** HSI top-level classification categories. */
export const CLASSIFICATION_CATEGORIES = ['A', 'B', 'C', 'D', 'Foundation'] as const;
export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<ClassificationCategory, string> = {
  A: 'Extremism / Ideology Monitoring', B: 'Public Trust', C: 'OSINT / Research', D: 'Media', Foundation: 'Platform Infrastructure',
};

/** Canonical HSI source types (Phase 70.3.2). */
export const SOURCE_TYPES = [
  'website', 'rss_feed', 'news_rss', 'youtube', 'tiktok', 'podcast_rss', 'forum', 'document',
  'manual', 'government', 'court_opinions', 'research_rss', 'reddit', 'social_page', 'api_foundation',
  'webhook', 'archive', 'intelligence_feed', 'watchlist', 'email', 'news_source', 'public_policy_org', 'threat_feed',
] as const;
export type SourceTypeTag = (typeof SOURCE_TYPES)[number];

/** Alias map (human labels + legacy types, lowercased) → canonical source type. */
export const SOURCE_TYPE_ALIASES: Record<string, SourceTypeTag> = {
  'website': 'website', 'web': 'website', 'site': 'website',
  'rss / atom feed': 'rss_feed', 'rss/atom feed': 'rss_feed', 'rss': 'rss_feed', 'atom': 'rss_feed', 'feed': 'rss_feed',
  'news (rss)': 'news_rss', 'news rss': 'news_rss',
  'youtube': 'youtube', 'youtube channel': 'youtube',
  'tiktok': 'tiktok',
  'podcast (rss)': 'podcast_rss', 'podcast rss': 'podcast_rss', 'podcast': 'podcast_rss',
  'forum': 'forum',
  'document': 'document', 'doc': 'document', 'pdf': 'document',
  'manual': 'manual',
  'government': 'government', 'gov': 'government',
  'court opinions': 'court_opinions', 'court': 'court_opinions',
  'research (rss)': 'research_rss', 'research rss': 'research_rss', 'research': 'research_rss',
  'reddit': 'reddit',
  'social page': 'social_page', 'social': 'social_page',
  'api (foundation)': 'api_foundation', 'api': 'api_foundation', 'api foundation': 'api_foundation',
  'webhook (inbound)': 'webhook', 'webhook': 'webhook',
  'archive': 'archive',
  'intelligence feed': 'intelligence_feed', 'intel feed': 'intelligence_feed',
  'watchlist (no rss)': 'watchlist', 'watchlist': 'watchlist',
  'email': 'email',
  'news sources': 'news_source', 'news source': 'news_source', 'newswire': 'news_source',
  'public policy organizations': 'public_policy_org', 'public policy organization': 'public_policy_org', 'public policy org': 'public_policy_org',
  'threat feed': 'threat_feed', 'threat_feed': 'threat_feed',
};

/** Normalize a raw source_type string to a canonical type, or null if unknown. */
export function normalizeSourceType(raw: unknown): SourceTypeTag | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k) return null;
  if ((SOURCE_TYPES as readonly string[]).includes(k)) return k as SourceTypeTag;
  return SOURCE_TYPE_ALIASES[k] ?? null;
}

/** Accepted CSV columns (order-independent; header-driven). */
export const CSV_COLUMNS = [
  'source_id', 'category', 'source_name', 'source_type', 'primary_url', 'feed_or_api_url',
  'platform', 'capture_interval_minutes', 'baseline_risk_1_5', 'content_selector', 'priority',
  'ingestion_mode', 'tags', 'description', 'corroboration_rule', 'notes', 'status',
] as const;

export function isSourceType(v: unknown): v is SourceTypeTag {
  return normalizeSourceType(v) !== null;
}
export function isDuplicateStatus(v: unknown): v is DuplicateStatus {
  return typeof v === 'string' && (DUPLICATE_STATUSES as readonly string[]).includes(v);
}

/** A normalized candidate (from a CSV row or a discovery finding). */
export interface CandidateInput {
  sourceName: string;
  sourceType: string | null;
  category: string | null;
  primaryUrl: string | null;
  feedOrApiUrl: string | null;
  platform: string | null;
  captureIntervalMinutes: number | null;
  baselineRisk: number | null;
  contentSelector: string | null;
  priority: string | null;
  ingestionMode: string | null;
  tags: string[];
  description: string | null;
  corroborationRule: string | null;
  notes: string | null;
}

export interface RowValidation { valid: boolean; errors: string[]; normalized: CandidateInput | null }

export interface Classification {
  category: ClassificationCategory;
  sourceType: SourceTypeTag;
  confidence: number; // 0–1
  reason: string;
}

export interface ExistingSource { id: string; name: string; homepageUrl: string | null; rssUrl: string | null; sourceType: string | null }

export interface DuplicateResult {
  duplicateStatus: DuplicateStatus;
  existingSourceId: string | null;
  existingSourceName: string | null;
  duplicateReason: string | null;
}

/** Exact + platform-identity duplicates block approval. */
export function blocksApproval(status: DuplicateStatus): boolean {
  return status === 'exact_duplicate' || status === 'platform_identity_duplicate';
}
/** Domain/feed/related require reviewer confirmation; platform-domain-only does not. */
export function requiresConfirmation(status: DuplicateStatus): boolean {
  return status === 'domain_duplicate' || status === 'feed_duplicate' || status === 'related_source';
}
