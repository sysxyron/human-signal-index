// =============================================================================
// HSI Phase 70.3.3 — Recommended next action (PURE, deterministic). Suggests the
// single most useful human action for a source from its computed state. Advice
// only — it never activates, publishes, or changes anything. No I/O.
// =============================================================================

import type { SourceHealth, CapabilityTier, GeoReadiness } from './types';

export interface AdviceInput {
  health: SourceHealth;
  capabilityTier: CapabilityTier;
  geoReadiness: GeoReadiness;
  yieldObserved: boolean;
  status: string | null;
  hasFeed: boolean;
}

/** One concrete, human-gated next step. Ordered by urgency. */
export function recommendNextAction(input: AdviceInput): string {
  if (input.health === 'blocked') return 'Resolve access (login/paywall/robots) before this source can be collected.';
  if (input.health === 'offline') return 'Investigate repeated failures — no recent successful fetch.';
  if (input.health === 'degraded') return 'Check the connector — recent failures or stale captures.';
  if ((input.status ?? '').toLowerCase() === 'paused' && input.capabilityTier === 'high') return 'Review and activate — paused but highly collectable.';
  if (!input.hasFeed && (input.capabilityTier === 'medium' || input.capabilityTier === 'low')) return 'Add a feed/API URL to enable automated collection.';
  if (input.capabilityTier === 'degraded') return 'Reclassify or add an access path — currently degraded collectability.';
  if (input.geoReadiness === 'partial_geo') return 'Geocode the place fields to make this source map-ready (Phase 71).';
  if (input.geoReadiness === 'missing_geo' && input.health === 'healthy') return 'Add country/region or coordinates for map readiness (optional).';
  if (input.health === 'healthy' && !input.yieldObserved) return 'Healthy but no signals yet — keep monitoring.';
  if (input.health === 'healthy' && input.yieldObserved) return 'Performing — no action needed.';
  return 'No action required.';
}
