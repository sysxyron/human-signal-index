'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { TopNav, Card } from '@hsi/ui';
import { Info } from 'lucide-react';
import { getGraph, WORLD_LIST, type WorldId } from '@/lib/worldforge/worlds';
import { ScientificConfidenceLegend } from '@/components/worldforge/ScientificConfidenceChip';

// React Flow touches the DOM (ResizeObserver etc.) — load client-only.
const DependencyGraphFlow = dynamic(
  () =>
    import('@/components/worldforge/DependencyGraphFlow').then(
      (m) => m.DependencyGraphFlow,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] items-center justify-center rounded-card border border-border bg-background-deep/60 text-caption text-text-muted">
        Loading interactive graph…
      </div>
    ),
  },
);

export default function DependencyGraphPage() {
  const [worldId, setWorldId] = useState<WorldId>('earth');
  const graph = useMemo(() => getGraph(worldId), [worldId]);

  return (
    <>
      <TopNav title="Dependency Graph" subtitle="Interactive causal simulation graph" />
      <main className="space-y-4 p-5 lg:p-6">
        <Card className="space-y-3" padded>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {WORLD_LIST.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setWorldId(w.id)}
                  className={`rounded-btn border px-3 py-1.5 text-caption font-semibold transition ${
                    w.id === worldId
                      ? 'border-electric/60 bg-primary/15 text-white'
                      : 'border-border bg-surface-2/60 text-text-secondary hover:border-electric hover:text-white'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
            <span className="text-caption text-text-muted">
              {graph.nodes.length} nodes · {graph.edges.length} edges
            </span>
          </div>
          <ScientificConfidenceLegend />
          <p className="flex items-start gap-2 text-caption text-text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Nodes are laid out in category columns (star → planet → chemistry → biology →
            intelligence → civilization → risk) and colored by scientific-confidence tier.
            Click any node to trace its inputs, outputs and provenance. Rendering uses
            <code className="mx-1 rounded bg-surface-3 px-1 py-0.5">onlyRenderVisibleElements</code>
            and a memoized layered layout, so it stays smooth at 1000+ nodes.
          </p>
        </Card>

        <DependencyGraphFlow graph={graph} />
      </main>
    </>
  );
}
