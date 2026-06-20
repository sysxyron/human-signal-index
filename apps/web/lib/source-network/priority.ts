// =============================================================================
// HSI Phase 70.3.3 — Collection priority scoring (PURE, deterministic).
// What HSI should collect first, from REAL inputs (baseline risk, category,
// type, signal yield, trust, watchlist/narrative relevance, manual priority,
// health). Explainable. Archived/dead sources drop to 'archive'. No I/O.
// =============================================================================

import { normalizeSourceType } from '../source-discovery/types';
import type { PriorityInput, CollectionPriority, ClassifiedResult } from './types';

const CATEGORY_WEIGHT: Record<string, number> = { A: 25, B: 18, C: 14, D: 10, Foundation: 8 };
const HIGH_VALUE_TYPES = new Set(['threat_feed', 'intelligence_feed', 'government', 'court_opinions', 'news_source', 'research_rss']);

/** Compute a 0–100 priority score and bucket it. Explains the top drivers. */
export function computeCollectionPriority(input: PriorityInput): ClassifiedResult<CollectionPriority> {
  // Dead/archived sources are not collection targets.
  if (input.health === 'archived') return { value: 'archive', reason: 'Source archived — excluded from the collection queue.' };

  const drivers: string[] = [];
  let score = 0;

  if (input.baselineRisk != null) {
    const r = Math.min(5, Math.max(1, input.baselineRisk));
    score += r * 8; // up to 40
    if (r >= 4) drivers.push(`high baseline risk (${r}/5)`);
  }

  const cat = (input.category ?? '').trim().toUpperCase();
  if (CATEGORY_WEIGHT[cat] != null) { score += CATEGORY_WEIGHT[cat]; if (cat === 'A' || cat === 'B') drivers.push(`category ${cat}`); }
  else if (cat === 'FOUNDATION' || /foundation/i.test(input.category ?? '')) score += CATEGORY_WEIGHT.Foundation;

  const type = normalizeSourceType(input.sourceType) ?? '';
  if (HIGH_VALUE_TYPES.has(type)) { score += 10; drivers.push(`high-value type (${type})`); }

  if (input.signals > 0) { score += Math.min(20, input.signals); if (input.signals >= 10) drivers.push(`productive (${input.signals} signals)`); }

  if (input.trustScore != null) { score += Math.round((input.trustScore / 100) * 10); if (input.trustScore >= 70) drivers.push(`trusted (${Math.round(input.trustScore)})`); }

  if (input.watchlistRelevant) { score += 8; drivers.push('watchlist-relevant'); }
  if (input.narrativeRelevant) { score += 8; drivers.push('narrative-relevant'); }

  const manual = (input.manualPriority ?? '').toLowerCase();
  if (manual === 'critical' || manual === 'high') { score += 12; drivers.push(`manual priority ${manual}`); }
  else if (manual === 'low') { score -= 8; drivers.push('manually deprioritized'); }

  // Health penalties — collect from working sources first.
  if (input.health === 'offline' || input.health === 'blocked') { score -= 15; drivers.push(`${input.health} (needs fixing before it can yield)`); }
  else if (input.health === 'degraded') score -= 5;

  score = Math.max(0, Math.min(100, score));

  let value: CollectionPriority;
  if (score >= 70) value = 'critical';
  else if (score >= 50) value = 'high';
  else if (score >= 30) value = 'medium';
  else value = 'low';

  const reason = drivers.length ? `Score ${score}/100 — ${drivers.slice(0, 4).join(', ')}.` : `Score ${score}/100 — baseline factors only.`;
  return { value, reason };
}
