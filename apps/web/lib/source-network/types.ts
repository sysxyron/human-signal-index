// =============================================================================
// HSI Phase 70.3.3 — Source Network Intelligence: shared types (PURE).
//
// Turns the source registry into a collection network: health, collection
// capability, signal yield, geo readiness, source families, and collection
// priority — all computed from REAL data only. Nothing here activates,
// publishes, crawls, or fabricates. PURE (no I/O, no @/ value imports).
// =============================================================================

export const SOURCE_HEALTHS = ['healthy', 'degraded', 'offline', 'paused', 'archived', 'blocked', 'unknown'] as const;
export type SourceHealth = (typeof SOURCE_HEALTHS)[number];

export const CAPABILITY_TIERS = ['high', 'medium', 'low', 'manual', 'degraded'] as const;
export type CapabilityTier = (typeof CAPABILITY_TIERS)[number];

export const GEO_READINESS = ['geo_ready', 'partial_geo', 'missing_geo', 'not_applicable'] as const;
export type GeoReadiness = (typeof GEO_READINESS)[number];

export const COLLECTION_PRIORITIES = ['critical', 'high', 'medium', 'low', 'archive'] as const;
export type CollectionPriority = (typeof COLLECTION_PRIORITIES)[number];

export const YIELD_TRENDS = ['rising', 'steady', 'declining', 'none'] as const;
export type YieldTrend = (typeof YIELD_TRENDS)[number];

/** Raw per-source signals computed by the DAL from real tables, fed to the
 *  pure classifiers. All fields are optional/nullable — absence means "unknown",
 *  never a fabricated value. */
export interface HealthInput {
  status: string | null;            // hsin_sources.status (active|paused|disabled|error|archived)
  monitoringEnabled: boolean | null; // hsin_sources.monitoring_enabled
  monitoringState: string | null;   // source_monitoring_state.state
  lastSuccessAt: string | null;     // last successful fetch
  lastFailureAt: string | null;     // last failed fetch
  recentEvents: { status: string | null; capturedAt: string | null }[]; // source_capture_events (newest-first)
  nowIso: string;                   // injected clock (deterministic)
}

export interface CapabilityInput {
  sourceType: string | null;
  hasFeed: boolean;                 // rss/feed/api url present
  hasUrl: boolean;                  // homepage/primary url present
  ingestionMode: string | null;    // may signal blocked/login/captcha/manual
  blocked: boolean;                 // monitoring/health says blocked
}

export interface GeoInput {
  sourceType: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  geoConfidence: number | null;
  geoSource: string | null;
}

export interface YieldCounts {
  signals: number;
  evidence: number;
  narratives: number;
  reports: number;
  forecasts: number;
  lastSignalAt: string | null;
  signalsRecent: number;            // signals in the recent window (e.g. last 30d)
  signalsPrior: number;             // signals in the prior window (30–60d) — for trend
}

export interface YieldSummary extends YieldCounts {
  total: number;                    // signals + evidence + reports
  trend: YieldTrend;
  observed: boolean;                // false → "not yet observed"
  lastSignalLabel: string;          // human label or "not yet observed"
}

export interface PriorityInput {
  baselineRisk: number | null;      // 1–5
  category: string | null;          // A/B/C/D/Foundation
  sourceType: string | null;
  signals: number;                  // signal yield
  trustScore: number | null;        // hsin_source_trust.trust_score 0–100
  watchlistRelevant: boolean;
  narrativeRelevant: boolean;
  manualPriority: string | null;    // explicit priority field
  health: SourceHealth;
}

export interface FamilyInput {
  id: string;
  name: string | null;
  homepageUrl: string | null;
  feedUrl: string | null;
  sourceType: string | null;
  identityKey: string | null;       // platform identity (youtube:@x, reddit:r/y)
  platform: string | null;
  tags: string[];
  organization: string | null;      // explicit parent/org if available
}

export interface SourceFamily {
  familyKey: string;
  displayName: string;
  memberIds: string[];
  members: { id: string; name: string; role: string }[]; // role = its asset role (Website/RSS/YouTube…)
  size: number;
}

export interface ClassifiedResult<T> { value: T; reason: string }
