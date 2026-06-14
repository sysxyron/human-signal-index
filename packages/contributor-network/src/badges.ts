// =============================================================================
// Badges — tied to MEASURABLE contribution thresholds. evaluateBadges() is pure:
// given contribution metrics it returns which badges are earned + how. No manual
// assignment here; the worker awards exactly what this function reports (audited).
// =============================================================================

import type { BadgeAward, BadgeDef, BadgeMetric, ContributionMetrics } from './types';

export const BADGE_DEFINITIONS: BadgeDef[] = [
  { id: 'signal_hunter', name: 'Signal Hunter', description: '25 accepted signals', metric: 'accepted_signals', threshold: 25 },
  { id: 'signal_veteran', name: 'Signal Veteran', description: '100 accepted signals', metric: 'accepted_signals', threshold: 100 },
  { id: 'source_scout', name: 'Source Scout', description: '50 approved sources', metric: 'approved_sources', threshold: 50 },
  { id: 'evidence_builder', name: 'Evidence Builder', description: '25 evidence packages', metric: 'evidence_packages', threshold: 25 },
  { id: 'pattern_detector', name: 'Pattern Detector', description: '100 linked signals', metric: 'linked_signals', threshold: 100 },
  { id: 'fact_checker', name: 'Fact Checker', description: '250 completed reviews', metric: 'completed_reviews', threshold: 250 },
  { id: 'traceability_master', name: 'Traceability Master', description: '95% traceability for 90 days', metric: 'traceability_days', threshold: 90 },
  { id: 'early_warning_operator', name: 'Early Warning Operator', description: '5 confirmed early detections', metric: 'confirmed_early_detections', threshold: 5 },
  { id: 'publication_builder', name: 'Publication Builder', description: '10 approved reports prepared', metric: 'approved_reports', threshold: 10 },
  { id: 'governance_steward', name: 'Governance Steward', description: '50 governance actions completed', metric: 'governance_actions', threshold: 50 },
];

const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGE_DEFINITIONS.map((b) => [b.id, b]));

export function badgeById(id: string): BadgeDef | undefined {
  return BADGE_BY_ID[id];
}

function metricValue(metrics: ContributionMetrics, metric: BadgeMetric): number {
  return metrics[metric] ?? 0;
}

/** Which badges does this contributor currently qualify for? Pure. */
export function evaluateBadges(metrics: ContributionMetrics): BadgeAward[] {
  const out: BadgeAward[] = [];
  for (const def of BADGE_DEFINITIONS) {
    const value = metricValue(metrics, def.metric);
    if (value >= def.threshold) {
      out.push({ badgeId: def.id, earnedByMetric: def.metric, value, threshold: def.threshold });
    }
  }
  return out;
}

/** Newly-earned badges = qualified now minus already-held (for the worker). */
export function newlyEarnedBadges(metrics: ContributionMetrics, alreadyHeld: string[]): BadgeAward[] {
  const held = new Set(alreadyHeld);
  return evaluateBadges(metrics).filter((a) => !held.has(a.badgeId));
}

/** Progress 0..1 toward a not-yet-earned badge (for "next badge" UI). */
export function badgeProgress(metrics: ContributionMetrics, badgeId: string): number {
  const def = BADGE_BY_ID[badgeId];
  if (!def) return 0;
  const value = metricValue(metrics, def.metric);
  if (def.threshold <= 0) return 1;
  return Math.min(1, value / def.threshold);
}
