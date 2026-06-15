// =============================================================================
// HSI Phase 25 — Leaderboards (/dashboard/leaderboard). Server Component,
// force-dynamic. QUALITY-WEIGHTED rankings (accepted contributions + reputation,
// never raw submissions). View selected via ?view=. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Trophy, ShieldCheck } from 'lucide-react';
import type { LeaderboardRow } from '@hsi/contributor-network';
import { getLeaderboardAction } from '@/lib/contributor/leaderboard';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VIEWS: Array<{ key: string; label: string }> = [
  { key: 'top_contributors', label: 'Top Contributors' },
  { key: 'top_researchers', label: 'Top Researchers' },
  { key: 'top_reviewers', label: 'Top Reviewers' },
  { key: 'top_curators', label: 'Top Curators' },
  { key: 'top_teams', label: 'Top Teams' },
  // Phase 28 — authority-ranked team-domain boards.
  { key: 'global', label: 'Global (Authority)' },
  { key: 'research', label: 'Research' },
  { key: 'review', label: 'Review' },
  { key: 'governance', label: 'Governance' },
  { key: 'security', label: 'Security' },
];

const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default async function LeaderboardPage({ searchParams }: { searchParams?: { view?: string } }) {
  const view = searchParams?.view ?? 'top_contributors';
  const res = await getLeaderboardAction(view);
  if (!res.ok) {
    return (
      <>
        <TopNav title="Leaderboard" subtitle="Quality-weighted contributor rankings" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} title="Could not load leaderboard" message="Leaderboards are unavailable right now." redirectedFrom="/dashboard/leaderboard" />
        </main>
      </>
    );
  }
  const { rows } = res.data;
  return (
    <>
      <TopNav title="Leaderboard" subtitle="Quality-weighted — rewards accepted work, not volume" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner message="Showing a labeled demo leaderboard. Live rankings are computed by the contributor-network worker." /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Rankings use <strong className="text-text-primary">accepted</strong> contributions and reputation. Rejected signals reduce your score, so spam never climbs the board.</p>
        </Card>

        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/dashboard/leaderboard?view=${v.key}` as never} className={`rounded-full px-3 py-1.5 text-caption font-medium transition ${v.key === res.data.view ? 'bg-electric text-white' : 'border border-border bg-surface/50 text-text-secondary hover:text-text-primary'}`}>{v.label}</Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No rankings yet" message="Rankings appear once contributions are recorded." />
        ) : (
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">#</th><th className="px-4 py-2.5 text-left">Name</th><th className="px-4 py-2.5 text-right">Score</th><th className="px-4 py-2.5 text-right">XP</th><th className="px-4 py-2.5 text-right">Reputation</th></tr>
              </thead>
              <tbody>
                {rows.map((r: LeaderboardRow) => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-label font-bold" style={r.rank <= 3 ? { backgroundColor: `${MEDAL[r.rank - 1]}26`, color: MEDAL[r.rank - 1] } : { color: '#94A3B8' }}>{r.rank}</span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{r.name}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-electric">{r.score.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{r.xp.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">{res.data.view === 'top_teams' ? '—' : r.reputation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="flex items-center gap-1.5 text-label text-text-muted"><Trophy className="h-3.5 w-3.5" /> Leaderboards recognise contribution quality. They never change anyone&apos;s access or role.</p>
      </main>
    </>
  );
}
