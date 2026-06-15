// =============================================================================
// HSI Phase 29 — Admin Outcome Monitoring (/dashboard/admin/outcome-monitoring).
// Server Component, force-dynamic, ADMIN-ONLY. READ-ONLY: top outcomes, largest
// impact-score changes, and team impact rankings. No manual impact editing —
// scores come only from the deterministic worker. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Target, TrendingUp, Crown, ShieldCheck } from 'lucide-react';
import { getOutcomeMonitoringAction, type OutcomeMonitoring } from '@/lib/contributor/attribution';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OutcomeMonitoringPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Outcome Monitoring" subtitle="Impact oversight — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Outcome monitoring is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/outcome-monitoring" />
        </main>
      </>
    );
  }

  const res = await getOutcomeMonitoringAction();
  let data: OutcomeMonitoring | null = null;
  let isDemo = false;
  if (res.ok) { data = res.data; isDemo = Boolean((res as { demo?: boolean }).demo); }
  if (!data) {
    return (
      <>
        <TopNav title="Outcome Monitoring" subtitle="Impact oversight" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load outcome monitoring" message={(res as { error?: string }).error ?? 'Unavailable right now.'} /></main>
      </>
    );
  }

  return (
    <>
      <TopNav title="Outcome Monitoring" subtitle="Top outcomes, impact changes, team rankings" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Read-only. Impact is computed deterministically from append-only outcomes with anti-gaming (no self-attribution / circular / duplicate chains). No manual impact editing.</p>
        </Card>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Target className="h-4 w-4 text-electric" /> Top outcomes</h2>
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2 text-left">Type</th><th className="px-4 py-2 text-left">Entity</th><th className="px-4 py-2 text-left">Reason</th><th className="px-4 py-2 text-right">Impact</th></tr>
              </thead>
              <tbody>
                {data.topOutcomes.length === 0 ? <tr><td colSpan={4} className="px-4 py-4 text-center text-text-muted">No outcomes yet.</td></tr> : data.topOutcomes.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2"><span className="rounded-full bg-electric/15 px-2 py-0.5 text-label font-semibold text-electric">{o.outcomeType.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-2 text-text-secondary">{o.entityKind} {o.entityId.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-text-muted">{o.reason ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-electric">{Math.round(o.impactWeight * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><TrendingUp className="h-4 w-4 text-warning" /> Largest impact changes</h2>
            <Card className="space-y-2 border-border" padded>
              {data.largestChanges.length === 0 ? <p className="text-caption text-text-muted">No changes yet.</p> : data.largestChanges.map((c, i) => (
                <div key={`${c.entityId}-${i}`} className="flex items-center justify-between text-caption">
                  <span className="text-text-secondary">{c.entityKind} {c.entityId.slice(0, 8)}</span>
                  <span className="tabular-nums text-text-muted">{c.previous ?? '—'} → <span className="text-text-primary">{c.next ?? '—'}</span></span>
                </div>
              ))}
            </Card>
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Crown className="h-4 w-4 text-electric" /> Team impact rankings</h2>
            <Card className="space-y-2 border-border" padded>
              {data.teamRankings.length === 0 ? <p className="text-caption text-text-muted">No team impact yet.</p> : data.teamRankings.map((t, i) => (
                <div key={t.teamKey} className="flex items-center justify-between text-caption">
                  <span className="capitalize text-text-secondary">{i + 1}. {t.teamKey}</span>
                  <span className="tabular-nums text-electric">{t.impact}</span>
                </div>
              ))}
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}
