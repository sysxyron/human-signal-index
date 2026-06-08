// =============================================================================
// HSI Phase 8 — Narrative Graph (/dashboard/intelligence/graph). Server
// Component, force-dynamic. The narrative/entity knowledge graph.
//
// Reads getNarrativeGraphAction({from,to,category}) from the querystring; renders
// a dynamically-imported (ssr:false) React Flow graph with narrative + entity
// nodes and edges colored by edgeType. A from/to + category filter updates the
// querystring (the server re-reads). Researcher+ can Rebuild the graph. Offline
// (NOT_CONFIGURED) → a clearly-labeled demo graph.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Network, Info } from 'lucide-react';
import type { NarrativeGraphData } from '@hsi/shared-types';
import { getNarrativeGraphAction } from '@/lib/operations/actions';
import { getSessionRole } from '@/lib/supabase/server';
import {
  canBuildGraph,
  demoNarrativeGraph,
  applyDemoGraphFilters,
} from '@/lib/operations/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { NarrativeGraphClient } from '@/components/graph/NarrativeGraphClient';
import { EdgeTypeLegend } from '@/components/graph/EdgeTypeLegend';
import { GraphFilters } from '@/components/graph/GraphFilters';
import { RebuildGraphButton } from '@/components/graph/RebuildGraphButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface GraphSearch {
  from?: string;
  to?: string;
  category?: string;
}

export default async function NarrativeGraphPage({
  searchParams,
}: {
  searchParams: GraphSearch;
}) {
  const filters = {
    from: searchParams.from,
    to: searchParams.to,
    category: searchParams.category,
  };

  const [res, role] = await Promise.all([
    getNarrativeGraphAction(filters),
    getSessionRole(),
  ]);

  const canBuild = canBuildGraph(role);

  let data: NarrativeGraphData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    data = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    data = applyDemoGraphFilters(demoNarrativeGraph(), filters);
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const categories = data
    ? Array.from(
        new Set(
          data.narratives
            .map((n) => n.category)
            .filter((c): c is string => Boolean(c)),
        ),
      ).sort()
    : [];

  const counts = data
    ? {
        narratives: data.narratives.length,
        entities: data.entities.length,
        edges: data.edges.length,
      }
    : null;

  return (
    <>
      <TopNav title="Narrative Graph" subtitle="How public narratives relate" />
      <main className="space-y-4 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Network className="h-5 w-5 text-electric" /> Narrative graph
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <RebuildGraphButton canBuild={canBuild} demo={isDemo} />
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState
            title="Could not load narrative graph"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/intelligence/graph"
          />
        ) : !data ? null : (
          <>
            <Card className="space-y-3" padded>
              <GraphFilters categories={categories} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <EdgeTypeLegend />
                {counts ? (
                  <span className="text-caption text-text-muted">
                    {counts.narratives} narratives · {counts.entities} entities ·{' '}
                    {counts.edges} edges
                  </span>
                ) : null}
              </div>
              <p className="flex items-start gap-2 text-caption text-text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Narratives (left) link to one another via explainable, colored
                edges; entities (right) are public topics / movements / platforms
                mentioned across signals. Click any node to inspect it. This is
                DRAFT research structure over PUBLIC signals for human review —
                never an auto-published claim. Rendering uses{' '}
                <code className="mx-1 rounded bg-surface-3 px-1 py-0.5">
                  onlyRenderVisibleElements
                </code>
                and a memoized layout.
              </p>
            </Card>

            {data.narratives.length === 0 && data.entities.length === 0 ? (
              <EmptyState
                icon={<Network className="h-5 w-5" />}
                title="No graph yet"
                message="No narratives match the current filters. Rebuild the graph from recent signals, or adjust the timeline/category filters."
              />
            ) : (
              <NarrativeGraphClient data={data} />
            )}
          </>
        )}
      </main>
    </>
  );
}
