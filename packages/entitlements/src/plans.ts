// =============================================================================
// Plan catalog + default entitlement matrix. PURE. Mirrors the DB seed (migration
// 0041) so the engine works offline + tests are deterministic. Community ships
// HIGH limits so the framework never blocks existing behaviour (Phase 37 goal).
// =============================================================================

import type { Entitlement, FeatureKey, PlanDef, PlanSlug } from './types';

export const PLAN_DEFS: PlanDef[] = [
  { slug: 'community', name: 'Community', description: 'Open contribution — generous defaults.', tier: 0 },
  { slug: 'professional', name: 'Professional', description: 'Teams + advanced analytics + API.', tier: 1 },
  { slug: 'enterprise', name: 'Enterprise', description: 'White-label, custom domains, AI agents.', tier: 2 },
  { slug: 'government', name: 'Government', description: 'Enterprise + advanced governance + air-gapped options.', tier: 3 },
];

export const FEATURE_KEYS: FeatureKey[] = [
  'advanced_analytics', 'white_label', 'api_access', 'custom_domains', 'ai_agents',
  'bulk_exports', 'advanced_governance', 'organization_branding', 'team_workspaces',
  'investigations_limit', 'publications_limit', 'contributors_limit',
];

const f = (featureKey: FeatureKey, enabled: boolean, limitValue: number | null = null): Entitlement => ({ featureKey, enabled, limitValue });

/** Default entitlements per plan. Community = high limits + branding/teams on. */
export const DEFAULT_ENTITLEMENTS: Record<PlanSlug, Entitlement[]> = {
  community: [
    f('advanced_analytics', false), f('white_label', false), f('api_access', false),
    f('custom_domains', false), f('ai_agents', false), f('bulk_exports', false),
    f('advanced_governance', false), f('organization_branding', true), f('team_workspaces', true),
    f('investigations_limit', true, 10000), f('publications_limit', true, 10000), f('contributors_limit', true, 10000),
  ],
  professional: [
    f('advanced_analytics', true), f('white_label', false), f('api_access', true),
    f('custom_domains', false), f('ai_agents', false), f('bulk_exports', true),
    f('advanced_governance', false), f('organization_branding', true), f('team_workspaces', true),
    f('investigations_limit', true, 100000), f('publications_limit', true, 100000), f('contributors_limit', true, 100000),
  ],
  enterprise: [
    f('advanced_analytics', true), f('white_label', true), f('api_access', true),
    f('custom_domains', true), f('ai_agents', true), f('bulk_exports', true),
    f('advanced_governance', true), f('organization_branding', true), f('team_workspaces', true),
    f('investigations_limit', true, null), f('publications_limit', true, null), f('contributors_limit', true, null),
  ],
  government: [
    f('advanced_analytics', true), f('white_label', true), f('api_access', true),
    f('custom_domains', true), f('ai_agents', true), f('bulk_exports', true),
    f('advanced_governance', true), f('organization_branding', true), f('team_workspaces', true),
    f('investigations_limit', true, null), f('publications_limit', true, null), f('contributors_limit', true, null),
  ],
};

export function isPlanSlug(s: string): s is PlanSlug {
  return PLAN_DEFS.some((p) => p.slug === s);
}
export function planDef(slug: string): PlanDef | undefined {
  return PLAN_DEFS.find((p) => p.slug === slug);
}
export function defaultEntitlements(slug: PlanSlug): Entitlement[] {
  return DEFAULT_ENTITLEMENTS[slug] ?? DEFAULT_ENTITLEMENTS.community;
}
