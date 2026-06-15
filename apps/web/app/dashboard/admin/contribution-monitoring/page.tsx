// =============================================================================
// HSI Phase 26 — Admin Contribution Monitoring (/dashboard/admin/contribution-
// monitoring). Server Component, force-dynamic, ADMIN-ONLY. READ-ONLY oversight:
// top contributors, reputation anomalies, suspicious growth, recent badge
// unlocks, and rank changes. No manual XP editing — awards come only from the
// audited recorder. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Trophy, AlertTriangle, TrendingUp, Award, ShieldCheck } from 'lucide-react';
import { getContributionMonitoringAction, getContributionMonitoringDemo, type ContributionMonitoring } from '@/lib/contributor/oversight';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ContributionMonitoringPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Contribution Monitoring" subtitle="Contributor oversight — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Contribution monitoring is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/contribution-monitoring" />
        </main>
      </>
    );
  }

  const res = await getContributionMonitoringAction();
  let data: ContributionMonitoring | null = null;
  let isDemo = false;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = await getContributionMonitoringDemo(); isDemo = true; }

  if (!data) {
    return (
      <>
        <TopNav title="Contribution Monitoring" subtitle="Contributor oversight" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load monitoring" message={(res as { error?: string }).error ?? 'Unavailable right now.'} /></main>
      </>
    );
  }

  return (
    <>
      <TopNav title="Contribution Monitoring" subtitle="Top contributors, anomalies, growth, badges, ranks" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Read-only. There is no manual XP editing — all awards are produced by the audited, idempotent recorder and traceable in <code className="text-text-primary">contribution_events</code>.</p>
        </Card>

        {/* Top contributors */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Trophy className="h-4 w-4 text-electric" /> Top contributors</h2>
          {data.topContributors.length === 0 ? <EmptyState title="No contributors yet" message="Contribution stats appear once the worker runs." /> : (
            <Card className="overflow-x-auto border-border p-0" padded={false}>
              <table className="w-full text-caption">
                <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                  <tr><th className="px-4 py-2 text-left">User</th><th className="px-4 py-2 text-left">Rank</th><th className="px-4 py-2 text-right">XP</th><th className="px-4 py-2 text-right">Reputation</th><th className="px-4 py-2 text-right">Accepted</th><th className="px-4 py-2 text-right">Reviews</th><th className="px-4 py-2 text-right">Badges</th></tr>
                </thead>
                <tbody>
                  {data.topContributors.map((c) => (
                    <tr key={c.userId} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-2 text-text-primary">{c.email ?? c.userId}</td>
                      <td className="px-4 py-2 text-text-secondary">{c.xpRank}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-electric">{c.xp.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{c.reputation}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">{c.signalsAccepted}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">{c.reviewsCompleted}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text-muted">{c.badges}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Anomalies */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><AlertTriangle className="h-4 w-4 text-warning" /> Reputation anomalies</h2>
            <Card className="space-y-2 border-border" padded>
              {data.anomalies.length === 0 ? <p className="text-caption text-text-muted">No anomalies flagged.</p> : data.anomalies.map((a) => (
                <div key={a.userId} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{a.email ?? a.userId}</span>
                  <span className="text-warning">{a.reason} (XP {a.xp.toLocaleString()} · rep {a.reputation})</span>
                </div>
              ))}
            </Card>
          </section>

          {/* Suspicious growth */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><TrendingUp className="h-4 w-4 text-error" /> Suspicious growth (24h)</h2>
            <Card className="space-y-2 border-border" padded>
              {data.suspiciousGrowth.length === 0 ? <p className="text-caption text-text-muted">No unusual activity in the last 24 hours.</p> : data.suspiciousGrowth.map((g) => (
                <div key={g.userId} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{g.email ?? g.userId}</span>
                  <span className="text-error">{g.eventsLast24h} events / 24h</span>
                </div>
              ))}
            </Card>
          </section>

          {/* Recent badges */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Award className="h-4 w-4 text-electric" /> Recent badge unlocks</h2>
            <Card className="space-y-2 border-border" padded>
              {data.recentBadges.length === 0 ? <p className="text-caption text-text-muted">No badges awarded yet.</p> : data.recentBadges.map((b, i) => (
                <div key={`${b.userId}-${b.badgeId}-${i}`} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{b.email ?? b.userId}</span>
                  <span className="text-text-secondary">{b.badgeId} · {new Date(b.awardedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </Card>
          </section>

          {/* Rank changes */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><TrendingUp className="h-4 w-4 text-success" /> Rank changes</h2>
            <Card className="space-y-2 border-border" padded>
              {data.recentRanks.length === 0 ? <p className="text-caption text-text-muted">No rank changes yet.</p> : data.recentRanks.map((r, i) => (
                <div key={`${r.userId}-${r.track}-${i}`} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{r.email ?? r.userId}</span>
                  <span className="text-text-secondary">{r.rankName} ({r.track})</span>
                </div>
              ))}
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}
