// =============================================================================
// HSI Phase 32 — Admin Beta Operations Center (/dashboard/admin/tester-ops).
// Server Component, force-dynamic, ADMIN-ONLY. Issue review queue, cohort
// analytics (activation/retention/completion), NPS, and per-cohort counts.
// Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Rocket, Bug, TrendingUp, Users, ShieldCheck } from 'lucide-react';
import { getBetaOpsAction, type BetaOps } from '@/lib/beta/tester';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { BetaIssueQueue } from '@/components/beta/BetaIssueQueue';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TesterOpsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Beta Operations" subtitle="Tester ops — admin only" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Beta operations is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/tester-ops" /></main>
      </>
    );
  }
  const res = await getBetaOpsAction();
  let data: BetaOps | null = null;
  let isDemo = false;
  if (res.ok) { data = res.data; isDemo = Boolean((res as { demo?: boolean }).demo); }
  if (!data) {
    return (<><TopNav title="Beta Operations" subtitle="Tester ops" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load beta operations" message={(res as { error?: string }).error ?? 'Unavailable right now.'} /></main></>);
  }
  const a = data.analytics;

  return (
    <>
      <TopNav title="Beta Operations" subtitle="Issue queue, cohort analytics, NPS" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}

        {/* Analytics (Deliverables 20, 22) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {([['Activation', `${a.activationRate}%`], ['Retention', `${a.retentionRate}%`], ['Completion', `${a.completionRate}%`], ['Mission completion', `${a.missionCompletionRate}%`], ['NPS', `${data.nps.score}`]] as Array<[string, string]>).map(([label, value]) => (
            <Card key={label} className="space-y-1 border-border" padded><div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><TrendingUp className="h-3.5 w-3.5" /> {label}</div><div className="text-h4 font-bold text-text-primary">{value}</div></Card>
          ))}
        </div>

        {/* Cohorts (Deliverable 22) */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Users className="h-4 w-4 text-electric" /> Cohorts</h2>
          <Card className="flex flex-wrap gap-4 border-border" padded>
            {data.cohorts.length === 0 ? <p className="text-caption text-text-muted">No testers yet.</p> : data.cohorts.map((c) => (
              <div key={c.key} className="text-caption"><span className="capitalize text-text-primary">{c.key}</span> <span className="text-text-muted">· {c.testers} testers</span></div>
            ))}
          </Card>
        </section>

        {/* Issue review queue (Deliverable 14) */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Bug className="h-4 w-4 text-warning" /> Issue review queue</h2>
          <BetaIssueQueue issues={data.issues} readonly={isDemo} />
        </section>

        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Testers self-serve their journey; this center is read + triage only. Role advancement stays in the admin-approved application queue — beta status never changes anyone&apos;s access.</p>
        </Card>
        <p className="flex items-center gap-1.5 text-label text-text-muted"><Rocket className="h-3.5 w-3.5" /> Operational reports (daily/weekly/monthly) derive from tester_activity windows.</p>
      </main>
    </>
  );
}
