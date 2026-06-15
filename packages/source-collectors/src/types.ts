// =============================================================================
// @hsi/source-collectors — types (HSI Phase 40). The advanced source-collection
// framework: the full source-type catalog, per-type validation/normalization,
// capture results, watchlist snapshots + diffs, and source-health states. PURE —
// fetching is injected; nothing here does network/DB/UI/Date.now() itself.
// =============================================================================

import type { ConnectorKind } from '@hsi/source-connectors';

/** Every supported source type (existing 8 + Phase-40 additions). */
export const SOURCE_TYPES = [
  // existing (Phase 7)
  'website', 'rss', 'youtube', 'tiktok', 'podcast', 'forum', 'document', 'manual',
  // Phase 40
  'news', 'research', 'reddit', 'social', 'government', 'watchlist',
  'email', 'api', 'webhook', 'archive', 'intelligence_feed',
] as const;
export type CollectorSourceType = (typeof SOURCE_TYPES)[number];

export function isSourceType(v: string): v is CollectorSourceType {
  return (SOURCE_TYPES as readonly string[]).includes(v);
}

/** Source health states (Phase 40, Deliverable L). */
export const SOURCE_HEALTH_STATES = [
  'healthy', 'warning', 'failing', 'disabled', 'unsupported', 'needs_configuration',
] as const;
export type SourceHealthState = (typeof SOURCE_HEALTH_STATES)[number];

/** A validation issue with an actionable message + optional suggestion/fix. */
export interface ValidationIssue {
  field: string;
  message: string;
  suggestion?: string;
}

/** What the Add/Edit Source form collects (type-dependent). */
export interface SourceDraft {
  sourceType: string;
  name?: string;
  url?: string; // generic URL field (homepage / feed / endpoint depending on type)
  rssUrl?: string;
  homepageUrl?: string;
  subreddit?: string;
  captureIntervalMinutes?: number;
  contentSelector?: string;
  apiMethod?: string;
}

/** Per-type config persisted alongside the source (hsin_sources.config jsonb). */
export interface SourceConfig {
  captureUrl?: string; // canonical URL the collector will fetch
  connector?: ConnectorKind | null;
  captureIntervalMinutes?: number;
  contentSelector?: string;
  subreddit?: string;
  apiMethod?: string;
  [key: string]: unknown;
}

export interface NormalizedSource {
  sourceType: CollectorSourceType;
  captureUrl: string | null; // null = no automated capture (manual/email/webhook foundation)
  connector: ConnectorKind | null;
  rssUrl: string | null;
  homepageUrl: string | null;
  config: SourceConfig;
}

export interface SourceValidation {
  ok: boolean;
  issues: ValidationIssue[];
  normalized?: NormalizedSource;
}

/** A single captured item (feed entry, reddit post, news article, …). */
export interface CapturedItem {
  title: string;
  url?: string;
  content: string;
  author?: string;
  publishedAt?: string; // ISO
  score?: number;
  comments?: number;
  metadata?: Record<string, unknown>;
}

/** Normalized capture output for a source type. */
export interface CollectorCapture {
  sourceType: CollectorSourceType;
  connector: ConnectorKind;
  url: string;
  items: CapturedItem[];
  content: string; // aggregate text (for hashing / change detection)
  hashDigest: string;
  capturedAt: string;
  raw?: string;
  metadata?: Record<string, unknown>;
}

/** A point-in-time snapshot of a watchlisted page (source_snapshots). */
export interface WatchlistSnapshot {
  url: string;
  text: string;
  contentHash: string;
  capturedAt: string;
}

/** The diff between two snapshots (source_diffs). */
export interface SourceDiff {
  changed: boolean;
  previousHash: string | null;
  newHash: string;
  previousLength: number;
  newLength: number;
  addedChars: number; // max(0, new - prev)
  removedChars: number; // max(0, prev - new)
}

/** The signal draft a capture produces (for the DAL to insert). */
export interface SignalDraftFromCapture {
  source_id: string;
  title: string;
  summary?: string;
  raw_content?: string;
  content_hash: string;
  signal_type: string;
  captured_at: string;
  status: 'new';
}
