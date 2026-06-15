// =============================================================================
// HSI Phase 36 — Organization Analytics (/dashboard/org/analytics). Server
// Component, force-dynamic. Org-scoped metrics. Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { BarChart3 } from 'lucide-react';
import { getOrgAnalyticsAction } from '@/lib/org/operations';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgAnalyticsPage() {
  const res = await getOrgAnalyticsAction();
  if (!res.ok) {
    return (<><TopNav title="Org Analytics" subtitle="Workspace metrics" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load analytics" message="Unavailable right now." redirectedFrom="/dashboard/org/analytics" /></main></>);
  }
  const a = res.data;
  return (
    <>
      <TopNav title="Org Analytics" subtitle="Members, contributions, trust — for your organization" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([['Members', a.members], ['Investigations', a.investigations], ['Publications', a.publications], ['Outcomes', a.outcomes], ['Avg trust', a.avgTrust], ['Avg authority', a.avgAuthority]] as Array<[string, number]>).map(([l, n]) => (
            <Card key={l} className="space-y-1 border-border" padded><div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><BarChart3 className="h-3.5 w-3.5" /> {l}</div><div className="text-h4 font-bold tabular-nums text-text-primary">{n.toLocaleString()}</div></Card>
          ))}
        </div>
        <p className="text-label text-text-muted">Metrics are scoped to your current organization. Growth trendlines arrive in a follow-up phase (per-org snapshots are recorded by the worker).</p>
      </main>
    </>
  );
}
