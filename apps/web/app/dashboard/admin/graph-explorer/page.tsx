// =============================================================================
// HSI Phase 30 — Admin Graph Explorer (/dashboard/admin/graph-explorer). Server
// Component, force-dynamic, ADMIN-ONLY. READ-ONLY view of the lineage graph:
// node/edge counts, orphan records, and broken chains. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Network, AlertTriangle, Unlink, ShieldCheck } from 'lucide-react';
import { getLineageOverviewAction, type LineageOverview } from '@/lib/contributor/lineage';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { AdminNav } from '@/components/admin/AdminNav';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GraphExplorerPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Graph Explorer" subtitle="Lineage graph — admin only" />
        <main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'The graph explorer is restricted to administrators.' : 'Sign in as an administrator.'} redirectedFrom="/dashboard/admin/graph-explorer" /></main>
      </>
    );
  }
  const res = await getLineageOverviewAction();
  const data: LineageOverview | null = res.ok ? res.data : null;
  if (!data) {
    return (<><TopNav title="Graph Explorer" subtitle="Lineage graph" /><main className="space-y-6 p-5 lg:p-6"><AdminNav /><ErrorState title="Could not load graph" message="Unavailable right now." /></main></>);
  }
  const h = data.health;

  return (
    <>
      <TopNav title="Graph Explorer" subtitle="Nodes, relationships, orphans, broken chains" />
      <main className="space-y-6 p-5 lg:p-6">
        <AdminNav />
        {res.ok && res.demo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2.5 border-border" padded>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption text-text-secondary">Read-only. The lineage graph is built from materialized links; broken chains + orphans are surfaced for repair, never auto-modified.</p>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['Nodes', h.nodeCount], ['Edges', h.edgeCount], ['Orphans', h.orphanCount], ['Broken chains', h.brokenChainCount]] as Array<[string, number]>).map(([label, n]) => (
            <Card key={label} className="space-y-1 border-border" padded><div className="flex items-center gap-1.5 text-label uppercase tracking-wide text-text-muted"><Network className="h-3.5 w-3.5" /> {label}</div><div className="text-h4 font-bold text-text-primary">{n}</div></Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><AlertTriangle className="h-4 w-4 text-warning" /> Broken chains</h2>
            <Card className="space-y-2 border-border" padded>
              {data.brokenChains.length === 0 ? <p className="text-caption text-text-muted">No broken chains.</p> : data.brokenChains.slice(0, 30).map((b, i) => (
                <div key={`${b.id}-${i}`} className="text-caption"><span className="text-text-primary">{b.kind} {b.id.slice(0, 8)}</span> — <span className="text-warning">{b.reason}</span></div>
              ))}
            </Card>
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Unlink className="h-4 w-4 text-error" /> Orphan records</h2>
            <Card className="space-y-2 border-border" padded>
              {data.orphans.length === 0 ? <p className="text-caption text-text-muted">No orphan records.</p> : data.orphans.slice(0, 40).map((o, i) => (
                <div key={`${o.id}-${i}`} className="text-caption text-text-secondary">{o.kind} {o.id.slice(0, 8)}</div>
              ))}
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}
