// =============================================================================
// HSI Phase 70.3 — Source Import / Discovery / Signal Scout: shared types (PURE).
//
// CSV vocabulary, candidate / duplicate / classification shapes. Everything is
// deterministic and review-gated; nothing here activates or publishes. PURE.
// =============================================================================

export const CANDIDATE_STATUSES = ['pending_review', 'approved', 'rejected', 'needs_changes', 'duplicate', 'archived'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const DUPLICATE_STATUSES = ['none', 'exact_duplicate', 'domain_duplicate', 'feed_duplicate', 'related_source'] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

/** HSI top-level classification categories. */
export const CLASSIFICATION_CATEGORIES = ['A', 'B', 'C', 'D', 'Foundation'] as const;
export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<ClassificationCategory, string> = {
  A: 'Extremism / Ideology Monitoring', B: 'Public Trust', C: 'OSINT / Research', D: 'Media', Foundation: 'Platform Infrastructure',
};

export const SOURCE_TYPES = [
  'website', 'rss', 'government', 'court', 'research', 'podcast', 'youtube', 'social',
  'forum', 'api', 'archive', 'watchlist', 'threat_feed', 'newswire',
] as const;
export type SourceTypeTag = (typeof SOURCE_TYPES)[number];

/** Accepted CSV columns (order-independent; header-driven). */
export const CSV_COLUMNS = [
  'source_id', 'category', 'source_name', 'source_type', 'primary_url', 'feed_or_api_url',
  'platform', 'capture_interval_minutes', 'baseline_risk_1_5', 'content_selector', 'priority',
  'ingestion_mode', 'tags', 'description', 'corroboration_rule', 'notes', 'status',
] as const;

export function isSourceType(v: unknown): v is SourceTypeTag {
  return typeof v === 'string' && (SOURCE_TYPES as readonly string[]).includes(v.toLowerCase());
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

/** Exact duplicates block approval; the rest require reviewer confirmation. */
export function blocksApproval(status: DuplicateStatus): boolean {
  return status === 'exact_duplicate';
}
export function requiresConfirmation(status: DuplicateStatus): boolean {
  return status === 'domain_duplicate' || status === 'feed_duplicate' || status === 'related_source';
}
