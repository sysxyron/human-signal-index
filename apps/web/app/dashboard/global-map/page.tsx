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
import { focusIntelligenceOnSources } from '@/lib/narrative-map/aggregate';
import { getNarrativeGeography } from '@/lib/narrative-intelligence/service';
import { MapReadinessOverview, MapReadinessReport, Phase72Panel } from '@/components/global-map/panels';
import { GeocodeButton } from '@/components/global-map/Controls';
import { LayeredMapExplorer, type NarrativeFocus } from '@/components/narrative-map/LayeredMapExplorer';
import { IntelOverview, BlindSpotPanel, RegionDetailTable } from '@/components/narrative-map/panels';
import { Card } from '@hsi/ui';
import { getRuntimeFlag } from '@/lib/hsi/edge-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GlobalMapPage({ searchParams }: { searchParams?: { narrative?: string } }) {
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
  const mapEnabled = await getRuntimeFlag('globalMapEnabled');
  const narrativeId = searchParams?.narrative?.trim() || null;
  const [data, phase72, intelFull, geoRes] = await Promise.all([
    getGlobalMapData(),
    getPhase72Readiness(),
    getGeospatialIntelligence(),
    narrativeId ? getNarrativeGeography(narrativeId) : Promise.resolve(null),
  ]);

  // Phase 75 — when ?narrative=<id> is present, isolate the map to that
  // narrative's member sources (real coordinates only; ungeolocated are noted).
  let intel = intelFull;
  let focus: NarrativeFocus | undefined;
  if (geoRes && geoRes.ok) {
    const g = geoRes.data.geography;
    const allowed = new Set(g.points.map((p) => p.sourceId));
    intel = focusIntelligenceOnSources(intelFull, allowed);
    focus = { id: geoRes.data.narrative.id, name: geoRes.data.narrative.name, geoReadySources: g.geoReadySources, ungeolocatedSources: g.ungeolocatedSources };
  }

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
          {mapEnabled ? (
            <LayeredMapExplorer data={intel} focus={focus} />
          ) : (
            <Card className="space-y-2">
              <h3 className="text-h6 font-semibold text-text-primary">Global Map is temporarily disabled by runtime configuration.</h3>
              <p className="text-body-sm text-text-secondary">The interactive map is turned off via runtime configuration, so the map canvas is not loaded. The readiness report and regional breakdowns below remain available.</p>
              <a href="/dashboard/global-map/readiness" className="inline-block text-caption text-electric hover:underline">View the geographic readiness report →</a>
            </Card>
          )}
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
