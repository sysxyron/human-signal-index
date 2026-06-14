// =============================================================================
// HSI Phase 24 — Contributor Operations (/dashboard/contributor-ops). Server
// Component, force-dynamic, researcher+. Read-only informational metrics about
// contributors: active, trusted, workload, throughput, review participation.
// No gamification. Renders a labeled sample where live data isn't present.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { UserCog } from 'lucide-react';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoContributorOps } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { StatCards } from '@/components/operations-os/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContributorOpsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !canResearch(role)) {
    return (
      <>
        <TopNav title="Contributor Operations" subtitle="Contributor activity and participation" />
        <main className="space-y-6 p-5 lg:p-6">
          <OperationsNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Contributor Operations is available to the researcher role or above.' : 'Sign in to view contributor operations.'} redirectedFrom="/dashboard/contributor-ops" />
        </main>
      </>
    );
  }

  const data = demoContributorOps();

  return (
    <>
      <TopNav title="Contributor Operations" subtitle="Who is contributing, and how — informational only, never a ranking" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><UserCog className="h-5 w-5 text-electric" /> Contributors</h2>
          <DemoBadge />
        </div>
        <OfflineDemoBanner message="Showing labeled sample metrics. Live contributor activity appears here once configured." />

        <StatCards items={[
          { label: 'Active', value: data.active, color: '#3B82F6' },
          { label: 'Trusted', value: data.trusted, color: '#10B981' },
        ]} />

        <Card className="overflow-hidden border-border p-0" padded={false}>
          <table className="w-full text-caption">
            <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
              <tr><th className="px-4 py-2 text-left">Contributor</th><th className="px-4 py-2 text-right">Completed</th><th className="px-4 py-2 text-right">Reviewed</th><th className="px-4 py-2 text-right">Published</th></tr>
            </thead>
            <tbody>
              {data.contributors.map((c) => (
                <tr key={c.name} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-medium text-text-primary">{c.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{c.completed}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{c.reviewed}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{c.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-label text-text-muted">These metrics are informational only — they are not a ranking, score, or leaderboard of people.</p>
      </main>
    </>
  );
}
