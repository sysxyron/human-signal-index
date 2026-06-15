// =============================================================================
// HSI Phase 36 — Organization Leaderboard (/dashboard/org/leaderboard). Server
// Component, force-dynamic. Organization-scoped only (tenant isolation). Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { getOrgLeaderboardAction, type OrgLeaderRow } from '@/lib/org/operations';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VIEWS = [
  { key: 'contributors', label: 'Contributors', sec: 'accepted' },
  { key: 'reviewers', label: 'Reviewers', sec: 'reviews' },
  { key: 'researchers', label: 'Researchers', sec: 'accepted' },
  { key: 'authorities', label: 'Authorities', sec: 'trust' },
  { key: 'impact', label: 'Impact leaders', sec: 'outcomes' },
];

export default async function OrgLeaderboardPage({ searchParams }: { searchParams?: { view?: string } }) {
  const view = searchParams?.view ?? 'contributors';
  const res = await getOrgLeaderboardAction(view);
  if (!res.ok) {
    return (<><TopNav title="Org Leaderboard" subtitle="Workspace rankings" /><main className="space-y-6 p-5 lg:p-6"><ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : undefined} title="Could not load leaderboard" message="Unavailable right now." redirectedFrom="/dashboard/org/leaderboard" /></main></>);
  }
  const meta = VIEWS.find((v) => v.key === res.data.view) ?? VIEWS[0];
  return (
    <>
      <TopNav title="Org Leaderboard" subtitle="Rankings within your organization" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/dashboard/org/leaderboard?view=${v.key}` as never} className={`rounded-full px-3 py-1.5 text-caption font-medium transition ${v.key === res.data.view ? 'bg-electric text-white' : 'border border-border bg-surface/50 text-text-secondary hover:text-text-primary'}`}>{v.label}</Link>
          ))}
        </div>
        {res.data.rows.length === 0 ? <EmptyState icon={<Trophy className="h-5 w-5" />} title="No rankings yet" message="Rankings appear once contributors are active in this organization." /> : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">#</th><th className="px-4 py-2.5 text-left">Contributor</th><th className="px-4 py-2.5 text-right">Score</th><th className="px-4 py-2.5 text-right capitalize">{meta.sec}</th></tr>
              </thead>
              <tbody>
                {res.data.rows.map((r: OrgLeaderRow, i) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">{i + 1}</td>
                    <td className="px-4 py-2.5 text-text-primary">{r.id}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-electric">{r.score.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.secondary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-label text-text-muted">Rankings are scoped to this organization only — no cross-tenant data.</p>
      </main>
    </>
  );
}
