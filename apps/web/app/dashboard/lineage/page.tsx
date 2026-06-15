// =============================================================================
// HSI Phase 30 — Lineage Explorer (/dashboard/lineage). Server Component,
// force-dynamic, researcher+. Trace any artifact's full chain (where it came
// from + what resulted). Query via ?kind=signal|investigation|publication&id=...
// Read-only traceability — never changes access. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { GitMerge, Search } from 'lucide-react';
import type { Lineage, LineageNode } from '@hsi/lineage';
import { getSignalLineageAction, getInvestigationLineageAction, getPublicationLineageAction, getLineageOverviewAction } from '@/lib/contributor/lineage';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const KINDS = ['signal', 'investigation', 'publication'] as const;

function Bucket({ title, nodes, kind }: { title: string; nodes: LineageNode[]; kind: string }) {
  return (
    <Card className="space-y-1.5 border-border" padded>
      <div className="flex items-center justify-between"><span className="text-label uppercase tracking-wide text-text-muted">{title}</span><span className="tabular-nums text-text-secondary">{nodes.length}</span></div>
      {nodes.length === 0 ? <p className="text-label text-text-muted">None</p> : (
        <ul className="space-y-0.5">
          {nodes.slice(0, 8).map((n) => (
            <li key={`${n.kind}:${n.id}`} className="truncate text-caption text-text-secondary">{n.label ?? n.id}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function LineageExplorerPage({ searchParams }: { searchParams?: { kind?: string; id?: string } }) {
  const kind = searchParams?.kind && (KINDS as readonly string[]).includes(searchParams.kind) ? searchParams.kind : '';
  const id = searchParams?.id ?? '';

  let lineage: Lineage | null = null;
  let demo = false;
  let forbidden = false;
  if (kind && id) {
    const res = kind === 'signal' ? await getSignalLineageAction(id) : kind === 'investigation' ? await getInvestigationLineageAction(id) : await getPublicationLineageAction(id);
    if (res.ok) { lineage = res.data; demo = Boolean(res.demo); }
    else if (res.code === 'FORBIDDEN' || res.code === 'AUTH_REQUIRED') forbidden = true;
  }
  const overview = await getLineageOverviewAction();
  const health = overview.ok ? overview.data.health : null;

  if (forbidden) {
    return (
      <>
        <TopNav title="Lineage Explorer" subtitle="Traceability graph" />
        <main className="space-y-6 p-5 lg:p-6"><ErrorState code="FORBIDDEN" title="Insufficient permissions" message="The lineage explorer is restricted to researchers and above." redirectedFrom="/dashboard/lineage" /></main>
      </>
    );
  }

  return (
    <>
      <TopNav title="Lineage Explorer" subtitle="Where did this come from · who touched it · what resulted" />
      <main className="space-y-6 p-5 lg:p-6">
        {demo || (overview.ok && overview.demo) ? <OfflineDemoBanner /> : null}

        {/* Search */}
        <Card className="space-y-3 border-border" padded>
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Search className="h-4 w-4 text-electric" /> Trace an artifact</h3>
          <form className="flex flex-wrap items-end gap-2" action="/dashboard/lineage" method="get">
            <label className="space-y-1"><span className="text-label text-text-muted">Kind</span>
              <select name="kind" defaultValue={kind || 'signal'} className="block rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary">
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="flex-1 space-y-1"><span className="text-label text-text-muted">ID</span>
              <input name="id" defaultValue={id} placeholder="artifact id" className="block w-full rounded-card border border-border bg-surface px-3 py-2 text-caption text-text-primary" />
            </label>
            <button type="submit" className="rounded-card bg-electric px-4 py-2 text-caption font-semibold text-white">Trace</button>
          </form>
          {health ? <p className="text-label text-text-muted">Graph health {health.healthScore}/100 · {health.nodeCount} nodes · {health.edgeCount} edges · completeness {health.chainCompleteness}%</p> : null}
        </Card>

        {lineage ? (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><GitMerge className="h-4 w-4 text-electric" /> Lineage of {lineage.root.kind} {lineage.root.id} <span className="text-label text-text-muted">(depth {lineage.depth})</span></h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Bucket title="Signals" nodes={lineage.signals} kind="signal" />
              <Bucket title="Evidence" nodes={lineage.evidence} kind="evidence" />
              <Bucket title="Investigations" nodes={lineage.investigations} kind="investigation" />
              <Bucket title="Reviews" nodes={lineage.reviews} kind="review" />
              <Bucket title="Governance" nodes={lineage.governance} kind="governance" />
              <Bucket title="Publications" nodes={lineage.publications} kind="publication" />
              <Bucket title="Outcomes" nodes={lineage.outcomes} kind="outcome" />
              <Bucket title="Contributors" nodes={lineage.contributors} kind="contributor" />
            </div>
          </section>
        ) : (
          <Card className="border-border" padded><p className="text-caption text-text-secondary">Enter an artifact kind + id above to trace its full lineage. Tip: open a signal and click “Open in lineage explorer”.</p></Card>
        )}
        <Link href={"/dashboard/impact" as never} className="inline-block text-caption text-electric hover:underline">← Impact &amp; outcomes</Link>
      </main>
    </>
  );
}
