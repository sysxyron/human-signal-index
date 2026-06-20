// =============================================================================
// HSI Phase 73 — Attention queue (PURE, deterministic). Builds a prioritized
// list from OBSERVABLE conditions only (counts handed in by the DAL). Severity
// per condition is fixed + documented; ordering is deterministic (severity, then
// count, then key). No AI prioritization, no fabricated items. No I/O.
// =============================================================================

import type { AttentionItem, Severity } from './types';

/** Each observable condition + its fixed severity + where it links. */
export interface AttentionInputs {
  blockedSources: number;
  offlineSources: number;
  missingFeeds: number;
  lowTrustSources: number;
  blindSpots: number;
  forecastsAwaitingReview: number;
  narrativesMissingEvidence: number;
  signalsMissingAttribution: number;
  missingGeoSources: number;
  brokenTransparencyChains: number;
}

const SPEC: Array<{ key: keyof AttentionInputs; label: string; severity: Severity; detail: string; href: string }> = [
  { key: 'blockedSources', label: 'Blocked sources', severity: 'critical', detail: 'Access blocked (login/paywall/robots) — cannot collect.', href: '/dashboard/source-discovery' },
  { key: 'offlineSources', label: 'Offline sources', severity: 'critical', detail: 'Repeated failures with no recent success.', href: '/dashboard/source-discovery' },
  { key: 'brokenTransparencyChains', label: 'Broken transparency chains', severity: 'high', detail: 'Published items whose lineage cannot be fully traced.', href: '/transparency' },
  { key: 'signalsMissingAttribution', label: 'Signals missing attribution', severity: 'high', detail: 'Signals with no relationships or source lineage.', href: '/dashboard/signal-network' },
  { key: 'narrativesMissingEvidence', label: 'Narratives missing evidence', severity: 'high', detail: 'Narrative/forecast activity with no corroborating evidence (blind spots).', href: '/dashboard/global-map' },
  { key: 'forecastsAwaitingReview', label: 'Forecasts awaiting review', severity: 'high', detail: 'Active forecasts past resolution date / unevaluated.', href: '/dashboard/forecast-validation' },
  { key: 'lowTrustSources', label: 'Low-trust sources', severity: 'medium', detail: 'Sources with a low trust band.', href: '/dashboard/source-reliability' },
  { key: 'missingFeeds', label: 'Sources missing feeds', severity: 'medium', detail: 'Web sources without a structured feed/API.', href: '/dashboard/source-discovery' },
  { key: 'blindSpots', label: 'Blind-spot regions', severity: 'medium', detail: 'Geographies with activity but no evidence.', href: '/dashboard/global-map' },
  { key: 'missingGeoSources', label: 'Sources missing geo', severity: 'low', detail: 'Sources not yet mappable (no coordinates).', href: '/dashboard/global-map/readiness' },
];

const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export function severityRank(s: Severity): number { return RANK[s]; }

/** Build the queue from observable counts. Only conditions with count>0 appear.
 *  Deterministic order: severity (critical first), then count desc, then key. */
export function buildAttentionQueue(inputs: AttentionInputs): AttentionItem[] {
  const items: AttentionItem[] = SPEC
    .map((s) => ({ key: s.key, label: s.label, count: inputs[s.key] ?? 0, severity: s.severity, detail: s.detail, href: s.href }))
    .filter((i) => i.count > 0);
  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.count - a.count || a.key.localeCompare(b.key));
}
