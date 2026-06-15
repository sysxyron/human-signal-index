// =============================================================================
// @hsi/entitlements — types. PURE (no DB, no UI, no Date.now()).
//
// The commercial feature-access model: plans, feature entitlements, and limits.
// PURE: it operates on an entitlement set passed in by the caller (the DAL loads
// it per organization). GOVERNANCE: entitlements gate FEATURES — never RBAC,
// auth, or platform access. Phase 37 ships high limits (framework only; no
// blocking of current Community defaults) and no payments.
// =============================================================================

export type PlanSlug = 'community' | 'professional' | 'enterprise' | 'government';

/** Boolean feature flags + limit keys (limit_value carries the cap). */
export type FeatureKey =
  | 'advanced_analytics'
  | 'white_label'
  | 'api_access'
  | 'custom_domains'
  | 'ai_agents'
  | 'bulk_exports'
  | 'advanced_governance'
  | 'organization_branding'
  | 'team_workspaces'
  // limit-bearing keys (enabled=true, limit_value = cap; null = unlimited)
  | 'investigations_limit'
  | 'publications_limit'
  | 'contributors_limit';

export interface Entitlement {
  featureKey: FeatureKey;
  enabled: boolean;
  /** Numeric cap for limit keys; null = unlimited. Ignored for boolean features. */
  limitValue: number | null;
}

export interface PlanDef {
  slug: PlanSlug;
  name: string;
  description: string;
  tier: number; // 0 = community … 3 = government
}

export type FeatureCheck = { ok: true } | { ok: false; reason: string; featureKey: FeatureKey };
