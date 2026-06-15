// =============================================================================
// HSI Phase 33 — System Health & Launch Readiness (/dashboard/admin/system-health).
// Server Component, force-dynamic, ADMIN-ONLY. Worker/queue health, platform
// metrics, operational KPIs, data-integrity, release checklist, and config audit.
// Read-only observability. Offline → labeled demo. RBAC unchanged.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Activity, Cpu, Database, Gauge, ShieldCheck, ListChecks, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import { getSystemHealthAction, type SystemHealth } from '@/lib/admin/system-health';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_COLOR: Record<string, string> = { healthy: '#10B981', degraded: '#F59E0B', down: '#EF4444', unknown: '#94A3B8' };

export default async function SystemHealthPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (<><TopNav title="System Health" subtitle="Launch readiness — admin only" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'System health is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/system-health" /></main></>);
  }
  const res = await getSystemHealthAction();
  let h: SystemHealth | null = null;
  let isDemo = false;
  if (res.ok) { h = res.data; isDemo = Boolean((res as { demo?: boolean }).demo); }
  if (!h) {
    return (<><TopNav title="System Health" subtitle="Launch readiness" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load system health" message={(res as { error?: string }).error ?? 'Unavailable right now.'} /></main></>);
  }

  return (
    <>
      <TopNav title="System Health" subtitle="HSI 1.0 launch readiness — workers, metrics, integrity, checklist" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {isDemo ? <OfflineDemoBanner /> : null}

        {/* Overall */}
        <Card className="flex flex-wrap items-center justify-between gap-4 border-border" padded>
          <div className="flex items-center gap-3"><Activity className="h-6 w-6 text-electric" /><div><div className="text-label uppercase tracking-wide text-text-muted">Overall status</div><div className="text-h4 font-bold capitalize" style={{ color: STATUS_COLOR[h.overall] }}>{h.overall}</div></div></div>
          <div className="text-right"><div className="text-label uppercase tracking-wide text-text-muted">Readiness</div><div className="text-h4 font-bold" style={{ color: h.readiness.ready ? '#10B981' : '#F59E0B' }}>{h.readiness.score}/100</div></div>
        </Card>

        {/* Workers (D3) + Queue (D4) */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Cpu className="h-4 w-4 text-electric" /> Workers</h2>
            <Card className="space-y-2 border-border" padded>
              {h.workers.map((w) => (
                <div key={w.name} className="flex items-center justify-between text-caption">
                  <span className="text-text-primary">{w.name}</span>
                  <span className="flex items-center gap-2"><span className="capitalize" style={{ color: STATUS_COLOR[w.status] }}>{w.status}</span><span className="text-text-muted">{w.ageMs !== null ? `${Math.round(w.ageMs / 60000)}m ago` : 'never'}{w.recentFailures > 0 ? ` · ${w.recentFailures} fail` : ''}</span></span>
                </div>
              ))}
            </Card>
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Gauge className="h-4 w-4 text-electric" /> Queue</h2>
            <Card className="grid grid-cols-2 gap-2 border-border sm:grid-cols-4" padded>
              {([['Pending', h.queue.counts.pending], ['Running', h.queue.counts.running], ['Failed', h.queue.counts.failed], ['Completed', h.queue.counts.completed]] as Array<[string, number]>).map(([l, n]) => (
                <div key={l}><div className="text-h6 font-bold tabular-nums text-text-primary">{n}</div><div className="text-label text-text-muted">{l}</div></div>
              ))}
              <div className="col-span-2 text-label text-text-muted sm:col-span-4">Status: <span className="capitalize" style={{ color: STATUS_COLOR[h.queue.status] }}>{h.queue.status}</span> · failure rate {h.queue.failureRate}%</div>
            </Card>
          </section>
        </div>

        {/* Platform metrics (D7) */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Database className="h-4 w-4 text-electric" /> Platform metrics</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([['Users', h.metrics.users], ['Signals', h.metrics.signals], ['Investigations', h.metrics.investigations], ['Publications', h.metrics.publications], ['Contributors', h.metrics.contributors]] as Array<[string, number]>).map(([l, n]) => (
              <Card key={l} className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">{l}</div><div className="text-h4 font-bold tabular-nums text-text-primary">{n.toLocaleString()}</div></Card>
            ))}
          </div>
        </section>

        {/* KPIs (D8) */}
        <section className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">Operational KPIs</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['Acceptance', `${h.kpis.acceptanceRate}%`], ['Review accuracy', `${h.kpis.reviewAccuracy}%`], ['Governance effectiveness', `${h.kpis.governanceEffectiveness}%`], ['Publications/wk', `${h.kpis.publicationThroughputPerWeek}`]] as Array<[string, string]>).map(([l, v]) => (
              <Card key={l} className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">{l}</div><div className="text-h5 font-bold text-text-primary">{v}</div></Card>
            ))}
          </div>
        </section>

        {/* Integrity (D19) + Config (D18) */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><AlertTriangle className="h-4 w-4 text-warning" /> Data integrity</h2>
            <Card className="space-y-2 border-border" padded>
              {h.integrity.issues.length === 0 ? <p className="text-caption text-success">No integrity issues detected.</p> : h.integrity.issues.map((i) => (
                <div key={i.kind} className="flex items-center justify-between text-caption"><span className="text-text-secondary">{i.kind}</span><span style={{ color: i.severity === 'critical' ? '#EF4444' : '#F59E0B' }}>{i.count}</span></div>
              ))}
              <p className="text-label text-text-muted">{h.integrity.clean ? 'No critical integrity issues — launch-safe.' : 'Critical integrity issues must be resolved before launch.'}</p>
            </Card>
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ShieldCheck className="h-4 w-4 text-electric" /> Configuration</h2>
            <Card className="space-y-1.5 border-border" padded>
              {h.config.checks.map((c) => (
                <div key={c.key} className="flex items-center justify-between text-caption">
                  <span className="text-text-secondary">{c.label}{c.required ? '' : ' (optional)'}</span>
                  {c.present ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-text-muted" />}
                </div>
              ))}
            </Card>
          </section>
        </div>

        {/* Release checklist (D17) */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ListChecks className="h-4 w-4 text-electric" /> HSI 1.0 release checklist</h2>
          <Card className="grid gap-1.5 border-border sm:grid-cols-2" padded>
            {h.checklist.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-caption">
                {c.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-text-muted" />}
                <span className={c.done ? 'text-text-primary' : 'text-text-secondary'}>{c.label}</span>
              </div>
            ))}
          </Card>
        </section>
      </main>
    </>
  );
}
