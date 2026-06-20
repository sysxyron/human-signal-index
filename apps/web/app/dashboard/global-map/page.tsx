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
import Link from 'next/link';
import { getGlobalMapData, getPhase72Readiness } from '@/lib/global-map/data';
import { getGeospatialIntelligence } from '@/lib/narrative-map/data';
import { MapReadinessOverview, MapReadinessReport, Phase72Panel } from '@/components/global-map/panels';
import { GeocodeButton } from '@/components/global-map/Controls';
import { LayeredMapExplorer } from '@/components/narrative-map/LayeredMapExplorer';
import { IntelOverview, BlindSpotPanel, RegionDetailTable } from '@/components/narrative-map/panels';

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
  const [data, phase72, intel] = await Promise.all([getGlobalMapData(), getPhase72Readiness(), getGeospatialIntelligence()]);

  return (
    <DashboardPage
      title="Global Intelligence Map"
      subtitle="Approved sources plotted from real coordinates — an intelligence navigation, provenance, and source-visibility layer. MapLibre + OpenStreetMap. No fabricated locations."
      actions={admin ? <GeocodeButton /> : undefined}
    >
      <div className="space-y-8">
        <MapReadinessOverview r={data.readiness} plottable={data.plottableTotal} />

        {/* Phase 72 — geospatial narrative intelligence (layered map) */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="space-y-1">
              <h2 className="text-h5 font-semibold text-text-primary">Geospatial intelligence layers</h2>
              <p className="text-caption text-text-muted">Narratives, evidence, forecasts, contradictions, trust & blind spots — inherited geo via Signal → Source. Real relationships only.</p>
            </div>
            <Link href={'/dashboard/global-map/readiness' as never} className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-electric hover:underline">Geographic readiness report →</Link>
          </div>
          <IntelOverview d={intel} />
          <LayeredMapExplorer data={intel} />
          <BlindSpotPanel d={intel} />
          <div className="grid gap-6 xl:grid-cols-2">
            <RegionDetailTable title="By country" rows={intel.byCountry} />
            <RegionDetailTable title="By region" rows={intel.byRegion} />
          </div>
        </section>

        <MapReadinessReport r={data.readiness} />
        <Phase72Panel r={phase72} />
      </div>
    </DashboardPage>
  );
}
