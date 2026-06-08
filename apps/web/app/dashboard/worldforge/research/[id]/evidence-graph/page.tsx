// =============================================================================
// WorldForge Phase 5 — CLAIM → EVIDENCE GRAPH (Server Component, force-dynamic).
// Renders an interactive React Flow graph of a run's claims and the evidence
// sources that support / contradict / contextualize them, edges colored by
// support type. The labeled Chronid demo builds the graph in-process from
// fixtures (no DB, no API keys) and is clearly marked "Demo". Loading is handled
// by the ssr:false dynamic import; errors render a styled card, never a white
// screen.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { Network, Beaker, ArrowLeft } from 'lucide-react';
import { resolveRunView } from '../../_resolve';
import { resolveGraphView } from './_resolve-graph';
import { ResearchTabs } from '@/components/worldforge/research/ResearchTabs';
import { RunErrorState } from '@/components/worldforge/research/RunErrorState';
import { ClaimEvidenceGraphClient } from '@/components/worldforge/evidence/ClaimEvidenceGraphClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ClaimEvidenceGraphPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { demo?: string };
}) {
  const [resolvedRun, resolvedGraph] = await Promise.all([
    resolveRunView(params.id, searchParams),
    resolveGraphView(params.id, searchParams),
  ]);

  if (resolvedRun.kind === 'error') {
    return (
      <>
        <TopNav title="Research run" subtitle="Claim → evidence graph" />
        <RunErrorState message={resolvedRun.message} code={resolvedRun.code} />
      </>
    );
  }

  const view = resolvedRun.view;
  const isDemo = view.isDemo;

  return (
    <>
      <TopNav title={view.title} subtitle="Claim → evidence graph" />
      <main className="space-y-6 p-5 lg:p-6">
        <ResearchTabs runId={view.id} demoQuery={isDemo} />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Network className="h-5 w-5 text-electric" /> Claim → evidence graph
            {isDemo ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                <Beaker className="h-3 w-3" /> Demo
              </span>
            ) : null}
          </h2>
          <Link
            href={
              `/dashboard/worldforge/research/${view.id}/evidence${isDemo ? '?demo=1' : ''}` as never
            }
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to evidence
          </Link>
        </div>

        {isDemo ? (
          <p className="text-caption leading-relaxed text-text-muted">
            This graph is computed in-process from the Chronid research claims and
            curated demo fixtures — no database or API keys required.
          </p>
        ) : null}

        {resolvedGraph.kind === 'error' ? (
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <Network className="h-5 w-5" /> Could not load the graph
            </h3>
            <p className="text-body-sm leading-relaxed text-text-secondary">
              {resolvedGraph.message}
            </p>
            {resolvedGraph.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Tip: open the labeled Chronid demo to explore the graph without a
                database.
              </p>
            ) : null}
          </Card>
        ) : resolvedGraph.graph.nodes.length === 0 ? (
          <Card className="space-y-1.5" padded>
            <p className="text-body-sm text-text-secondary">
              No claim–evidence links yet for this run.
            </p>
            <p className="text-caption text-text-muted">
              Gather evidence on the Evidence tab to build the graph.
            </p>
          </Card>
        ) : (
          <ClaimEvidenceGraphClient graph={resolvedGraph.graph} />
        )}
      </main>
    </>
  );
}
