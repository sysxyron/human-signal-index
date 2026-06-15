// =============================================================================
// Recommended starter sources — PURE data (Deliverable P). Safe public feeds +
// one watchlist example. Disabled by default so an admin opts each one in.
// =============================================================================

import type { CollectorSourceType } from './types';

export interface RecommendedSource {
  name: string;
  sourceType: CollectorSourceType;
  url: string; // feed or page URL
  description: string;
  enabledByDefault: boolean;
  riskLevel: number;
}

export const RECOMMENDED_SOURCES: RecommendedSource[] = [
  { name: 'Google News — Artificial Intelligence', sourceType: 'news', url: 'https://news.google.com/rss/search?q=artificial+intelligence', description: 'Google News RSS for AI coverage.', enabledByDefault: false, riskLevel: 2 },
  { name: 'Google News — Population Decline', sourceType: 'news', url: 'https://news.google.com/rss/search?q=population+decline', description: 'Google News RSS tracking demographic-decline narratives.', enabledByDefault: false, riskLevel: 2 },
  { name: 'arXiv — Computer Science: AI', sourceType: 'research', url: 'https://export.arxiv.org/rss/cs.AI', description: 'arXiv cs.AI new-submissions RSS feed.', enabledByDefault: false, riskLevel: 1 },
  { name: 'Reddit — r/antinatalism', sourceType: 'reddit', url: 'https://www.reddit.com/r/antinatalism/.rss', description: 'Public subreddit RSS for antinatalism discourse.', enabledByDefault: false, riskLevel: 3 },
  { name: 'Watchlist — proextinction.com', sourceType: 'watchlist', url: 'https://proextinction.com', description: 'Static ideology site monitored for content changes (no RSS).', enabledByDefault: false, riskLevel: 4 },
];
