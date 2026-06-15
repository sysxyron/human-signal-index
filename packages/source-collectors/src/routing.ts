// =============================================================================
// Source-type routing — PURE. Maps a source type to the capture connector and
// declares which types support automated capture vs foundation-only.
// =============================================================================

import type { ConnectorKind } from '@hsi/source-connectors';
import type { CollectorSourceType } from './types';

/** Feed-backed types capture via the RSS/Atom connector. */
const RSS_TYPES = new Set<CollectorSourceType>(['rss', 'news', 'research', 'government', 'reddit', 'podcast', 'youtube', 'intelligence_feed']);
/** Page-backed types capture via the public-page connector (text extraction). */
const PAGE_TYPES = new Set<CollectorSourceType>(['website', 'watchlist', 'forum', 'social', 'archive', 'tiktok']);
/** Foundation-only types — no automated capture yet (handled manually / externally). */
const FOUNDATION_TYPES = new Set<CollectorSourceType>(['document', 'manual', 'email', 'api', 'webhook']);

/** The capture connector for a source type, or null when not auto-captured. PURE. */
export function connectorForSourceType(sourceType: CollectorSourceType): ConnectorKind | null {
  if (RSS_TYPES.has(sourceType)) return 'rss';
  if (PAGE_TYPES.has(sourceType)) return 'public_page';
  return null;
}

/** Does this source type support automated capture? PURE. */
export function supportsAutomatedCapture(sourceType: CollectorSourceType): boolean {
  return connectorForSourceType(sourceType) !== null;
}

/** Is this a foundation-only (no auto-capture) type? PURE. */
export function isFoundationType(sourceType: CollectorSourceType): boolean {
  return FOUNDATION_TYPES.has(sourceType);
}

/** Map a source type to the persisted hsin_signals.signal_type. PURE. */
export function signalTypeForSource(sourceType: CollectorSourceType): string {
  switch (sourceType) {
    case 'reddit': case 'forum': return 'forum_post';
    case 'social': return 'social_post';
    case 'youtube': case 'tiktok': return 'video';
    case 'podcast': return 'podcast_episode';
    case 'document': case 'archive': return 'document';
    case 'manual': return 'manual_submission';
    case 'rss': case 'news': case 'research': case 'government': case 'website': case 'watchlist': case 'intelligence_feed':
    default: return 'article';
  }
}
