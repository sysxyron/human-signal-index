// =============================================================================
// HSI Phase 72 — Geographic readiness report (/dashboard/global-map/readiness).
// Reviewer+ (inherits the /dashboard/global-map prefix gate). Real counts only:
// source / signal / narrative / forecast / evidence readiness + missing-geo
// inventory + per-geography drill-down. Read-only.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../../components/dashboard-shell';
import { getGeospatialIntelligence, getGeoReadinessReport } from '@/lib/narrative-map/data';
import { GeoReadinessPanel, RegionDetailTable } from '@/components/narrative-map/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GeoReadinessPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Map Readiness" subtitle="Geographic readiness report" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Map readiness is available to reviewers and admins.' : 'Sign in to view map readiness.'} redirectedFrom="/dashboard/global-map/readiness" />
        </main>
      </>
    );
  }

  const [report, intel] = await Promise.all([getGeoReadinessReport(), getGeospatialIntelligence()]);

  return (
    <DashboardPage title="Geographic Readiness Report" subtitle="Source / signal / narrative / forecast / evidence geo readiness and missing-geo inventory — real counts only.">
      <div className="space-y-8">
        <GeoReadinessPanel r={report} />
        <RegionDetailTable title="By country" rows={intel.byCountry} />
        <RegionDetailTable title="By region" rows={intel.byRegion} />
        <RegionDetailTable title="By city" rows={intel.byCity} />
      </div>
    </DashboardPage>
  );
}
