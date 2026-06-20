// =============================================================================
// HSI Phase 70.3.3 — Collection capability scoring (PURE, deterministic).
// How collectable a source is, given its type + available fields. Real inputs
// only; no fabricated scores. Blocked/login/CAPTCHA → degraded. No I/O.
// =============================================================================

import { normalizeSourceType } from '../source-discovery/types';
import type { CapabilityInput, CapabilityTier, ClassifiedResult } from './types';

/** Feed/API types are highly collectable when a feed URL is present. */
const FEED_TYPES = new Set(['rss_feed', 'news_rss', 'research_rss', 'podcast_rss', 'api_foundation', 'webhook', 'threat_feed', 'intelligence_feed']);
/** Manual/low-automation types regardless of URL. */
const MANUAL_TYPES = new Set(['watchlist', 'manual', 'document', 'archive', 'email']);
/** Ingestion modes that imply a human/blocked path. */
const BLOCKED_MODE = /login|captcha|paywall|manual|blocked|disabled/i;

export interface CapabilityResult { tier: CapabilityTier; score: number; reason: string }

/** Score 0–100 + tier. Higher = more automatable collection. */
export function computeCollectionCapability(input: CapabilityInput): CapabilityResult {
  const type = normalizeSourceType(input.sourceType) ?? '';
  const modeBlocked = input.ingestionMode ? BLOCKED_MODE.test(input.ingestionMode) : false;

  // Access blocked overrides everything — can't reliably collect.
  if (input.blocked || modeBlocked) {
    return { tier: 'degraded', score: 20, reason: input.blocked ? 'Access blocked (login/paywall/robots) — degraded collectability.' : `Ingestion mode "${input.ingestionMode}" implies a manual/blocked path.` };
  }

  // Feed / API types with an endpoint = highest collectability.
  if (FEED_TYPES.has(type)) {
    if (input.hasFeed) return { tier: 'high', score: 95, reason: `${type} with a feed/endpoint URL — high collectability.` };
    return { tier: 'low', score: 30, reason: `${type} but no feed/endpoint URL provided — low collectability until a feed is added.` };
  }

  // Manual/low-automation types.
  if (MANUAL_TYPES.has(type)) {
    return { tier: 'manual', score: 35, reason: `${type} — manual/low-automation collection.` };
  }

  // Platform/social/website types: collectable via URL but no structured feed.
  if (input.hasFeed) return { tier: 'high', score: 85, reason: 'Structured feed/endpoint available — high collectability.' };
  if (input.hasUrl) return { tier: 'medium', score: 60, reason: 'Web URL present but no structured feed — medium collectability.' };

  return { tier: 'low', score: 10, reason: 'No feed and no URL — not collectable as configured.' };
}
