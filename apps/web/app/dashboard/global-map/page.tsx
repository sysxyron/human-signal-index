// =============================================================================
// HSI Phase 71 — Global Intelligence Map (/dashboard/global-map). Server
// Component, force-dynamic, reviewer+ (admins can run the geocoder). An
// intelligence navigation / provenance / source-visibility layer over the
// approved source registry — MapLibre + OpenStreetMap only. Real points only;
// nothing activates, publishes, crawls, or fabricates coordinates.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getGlobalMapData, getPhase72Readiness } from '@/lib/global-map/data';
import { MapExplorer } from '@/components/global-map/MapExplorer';
import { MapReadinessOverview, MapReadinessReport, Phase72Panel } from '@/components/global-map/panels';
import { GeocodeButton } from '@/components/global-map/Controls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GlobalMapPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Global Map" subtitle="Global intelligence map foundation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'The Global Map is available to reviewers and admins.' : 'Sign in to view the intelligence map.'} redirectedFrom="/dashboard/global-map" />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const [data, phase72] = await Promise.all([getGlobalMapData(), getPhase72Readiness()]);

  return (
    <DashboardPage
      title="Global Intelligence Map"
      subtitle="Approved sources plotted from real coordinates — an intelligence navigation, provenance, and source-visibility layer. MapLibre + OpenStreetMap. No fabricated locations."
      actions={admin ? <GeocodeButton /> : undefined}
    >
      <div className="space-y-8">
        <MapReadinessOverview r={data.readiness} plottable={data.plottableTotal} />
        <MapExplorer data={data} />
        <MapReadinessReport r={data.readiness} />
        <Phase72Panel r={phase72} />
      </div>
    </DashboardPage>
  );
}
