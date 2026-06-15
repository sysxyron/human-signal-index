// =============================================================================
// HSI Phase 30 — Admin Graph Health (/dashboard/admin/graph-health). Server
// Component, force-dynamic, ADMIN-ONLY. READ-ONLY lineage health metrics:
// health score, coverage, chain completeness, broken chains, orphans, avg trace
// depth. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Activity, ShieldCheck } from 'lucide-react';
import { getLineageOverviewAction, type LineageOverview } from '@/lib/contributor/lineage';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function score(n: number): string { return n >= 80 ? '#10B981' : n >= 50 ? '#F59E0B' : '#EF4444'; }

export default async function GraphHealthPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Graph Health" subtitle="Lineage health — admin only" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Graph health is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/graph-health" /></main>
      </>
    );
  }
  const res = await getLineageOverviewAction();
  const data: LineageOverview | null = res.ok ? res.data : null;
  if (!data) {
    return (<><TopNav title="Graph Health" subtitle="Lineage health" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load graph health" message="Unavailable right now." /></main></>);
  }
  const h = data.health;

  return (
    <>
      <TopNav title="Graph Health" subtitle="Lineage completeness, coverage, and integrity" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {res.ok && res.demo ? <OfflineDemoBanner /> : null}

        <Card className="flex flex-wrap items-center justify-between gap-4 border-electric/30 bg-electric/5" padded>
          <div className="flex items-center gap-3"><Activity className="h-6 w-6 text-electric" /><div><div className="text-label uppercase tracking-wide text-text-muted">Lineage health</div><div className="text-h3 font-bold" style={{ color: score(h.healthScore) }}>{h.healthScore}<span className="text-caption text-text-muted">/100</span></div></div></div>
          <div className="text-right text-caption text-text-secondary">Coverage {h.coverage}% · completeness {h.chainCompleteness}% · avg depth {h.averageTraceDepth}</div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['Health', h.healthScore], ['Coverage', h.coverage], ['Completeness', h.chainCompleteness],
            ['Orphans', h.orphanCount], ['Broken', h.brokenChainCount], ['Cycles', h.cycleCount],
          ] as Array<[string, number]>).map(([label, n]) => (
            <Card key={label} className="space-y-1 border-border" padded><div className="text-label uppercase tracking-wide text-text-muted">{label}</div><div className="text-h5 font-bold tabular-nums text-text-primary">{n}</div></Card>
          ))}
        </div>

        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Health is computed deterministically by the worker from the lineage graph: completeness (investigations with a full chain) + coverage (non-orphan share), penalised by broken chains and cycles. See the Graph Explorer for the specific records to repair.</p>
        </Card>
      </main>
    </>
  );
}
