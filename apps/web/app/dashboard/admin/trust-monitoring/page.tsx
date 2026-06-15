// =============================================================================
// HSI Phase 27 — Admin Trust Monitoring (/dashboard/admin/trust-monitoring).
// Server Component, force-dynamic, ADMIN-ONLY. READ-ONLY oversight of the trust
// graph: rapid trust increases/decreases (possible gaming), authority rankings,
// and suspicious behaviour. No manual trust editing — scores come only from the
// deterministic worker. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { TrendingUp, TrendingDown, ShieldCheck, Crown } from 'lucide-react';
import { getTrustMonitoringAction, type TrustMonitoring } from '@/lib/contributor/trust';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TrustMonitoringPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Trust Monitoring" subtitle="Trust oversight — admin only" />
        <main className="space-y-6 p-5 lg:p-6">
          <AdminNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Trust monitoring is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/trust-monitoring" />
        </main>
      </>
    );
  }

  const res = await getTrustMonitoringAction();
  let data: TrustMonitoring | null = null;
  let isDemo = false;
  if (res.ok) { data = res.data; isDemo = Boolean((res as { demo?: boolean }).demo); }

  if (!data) {
    return (
      <>
        <TopNav title="Trust Monitoring" subtitle="Trust oversight" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load trust monitoring" message={(res as { error?: string }).error ?? 'Unavailable right now.'} /></main>
      </>
    );
  }

  return (
    <>
      <TopNav title="Trust Monitoring" subtitle="Rapid moves, authority rankings, anomalies" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Read-only. Trust scores are computed deterministically by the worker from append-only events; self-validation is excluded (anti-gaming). There is no manual trust editing.</p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><TrendingUp className="h-4 w-4 text-success" /> Rapid trust increases</h2>
            <Card className="space-y-2 border-border" padded>
              {data.rapidIncreases.length === 0 ? <p className="text-caption text-text-muted">None flagged.</p> : data.rapidIncreases.map((m, i) => (
                <div key={`${m.userId}-${i}`} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{m.email ?? m.userId}</span>
                  <span className="text-success">+{m.delta} → {m.newAuthority}</span>
                </div>
              ))}
            </Card>
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><TrendingDown className="h-4 w-4 text-error" /> Rapid trust decreases</h2>
            <Card className="space-y-2 border-border" padded>
              {data.rapidDecreases.length === 0 ? <p className="text-caption text-text-muted">None flagged.</p> : data.rapidDecreases.map((m, i) => (
                <div key={`${m.userId}-${i}`} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{m.email ?? m.userId}</span>
                  <span className="text-error">{m.delta} → {m.newAuthority}</span>
                </div>
              ))}
            </Card>
          </section>
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Crown className="h-4 w-4 text-electric" /> Authority rankings</h2>
          <Card className="overflow-x-auto border-border p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">User</th><th className="px-4 py-2 text-left">Level</th><th className="px-4 py-2 text-right">Authority</th><th className="px-4 py-2 text-right">Trust</th></tr>
              </thead>
              <tbody>
                {data.rankings.map((r, i) => (
                  <tr key={r.userId} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2 tabular-nums text-text-muted">{i + 1}</td>
                    <td className="px-4 py-2 text-text-primary">{r.email ?? r.userId}</td>
                    <td className="px-4 py-2 text-text-secondary">{r.level}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-electric">{r.authority}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{r.trust}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      </main>
    </>
  );
}
