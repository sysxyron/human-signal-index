// =============================================================================
// HSI Phase 41B — source update field mapping (PURE, testable).
//
// Beta feedback (D): editing a source did not persist type/status/monitoring.
// Root cause: updateSource never wrote `source_type`, and the edit form sent no
// status / monitoring_enabled. This is the single mapping from the editable
// patch to hsin_sources columns — including source_type — so the DAL writes
// EVERY editable field. PURE so it can be unit-tested without a DB.
// =============================================================================

export interface UpdateSourcePatch {
  name?: string;
  description?: string;
  /** Phase 41B: source type is now editable + persisted. */
  sourceType?: string;
  platform?: string;
  homepageUrl?: string;
  rssUrl?: string;
  riskLevel?: number;
  status?: string;
  monitoringEnabled?: boolean;
  config?: Record<string, unknown>;
}

/**
 * Map an UpdateSourcePatch to hsin_sources column updates. Only defined keys are
 * included (partial update). `updated_at` is always refreshed. PURE.
 */
export function buildSourceUpdate(patch: UpdateSourcePatch): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.sourceType !== undefined) update.source_type = patch.sourceType;
  if (patch.platform !== undefined) update.platform = patch.platform;
  if (patch.homepageUrl !== undefined) update.homepage_url = patch.homepageUrl;
  if (patch.rssUrl !== undefined) update.rss_url = patch.rssUrl;
  if (patch.riskLevel !== undefined) update.risk_level = patch.riskLevel;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.monitoringEnabled !== undefined) update.monitoring_enabled = patch.monitoringEnabled;
  if (patch.config !== undefined) update.config = patch.config;
  update.updated_at = new Date().toISOString();
  return update;
}
