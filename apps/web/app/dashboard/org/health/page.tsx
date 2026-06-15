// =============================================================================
// HSI Phase 36 — Organization Health (/dashboard/org/health). Server Component,
// force-dynamic. Org-scoped operational health. Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Activity } from 'lucide-react';
import { getOrgHealthAction } from '@/lib/org/operations';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OrgHealthPage() {
  const res = await getOrgHealthAction();
  if (!res.ok) {
    return (<><TopNav title="Org Health" subtitle="Workspace health" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load health" message="Unavailable right now." redirectedFrom="/dashboard/org/health" /></main></>);
  }
  const h = res.data;
  const fresh = h.workerFreshnessMins === null ? 'never' : `${h.workerFreshnessMins}m ago`;
  return (
    <>
      <TopNav title="Org Health" subtitle="Activity + worker freshness for your organization" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {([['Active contributors', String(h.activeContributors)], ['Review throughput (7d)', String(h.reviewThroughput)], ['Publications', String(h.publicationThroughput)], ['Governance (7d)', String(h.governanceActivity)], ['Worker freshness', fresh]] as Array<[string, string]>).map(([l, v]) => (
            <Card key={l} className="space-y-1 border-border" padded><div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Activity className="h-3.5 w-3.5" /> {l}</div><div className="text-h5 font-bold text-text-primary">{v}</div></Card>
          ))}
        </div>
        <p className="text-label text-text-muted">Health reflects this organization&apos;s activity over the last 7 days plus the freshness of its trust recompute.</p>
      </main>
    </>
  );
}
