'use client';

// =============================================================================
// HSI Phase 8 — NarrativeGraphClient. Client wrapper that loads the React Flow
// NarrativeGraphFlow with ssr:false (React Flow touches the DOM: ResizeObserver
// etc.), mirroring the WorldForge dependency-graph pattern.
// =============================================================================

import dynamic from 'next/dynamic';
import type { NarrativeGraphData } from '@hsi/shared-types';

const NarrativeGraphFlow = dynamic(
  () => import('./NarrativeGraphFlow').then((m) => m.NarrativeGraphFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] items-center justify-center rounded-card border border-border bg-background-deep/60 text-caption text-text-muted">
        Loading narrative graph…
      </div>
    ),
  },
);

export function NarrativeGraphClient({ data }: { data: NarrativeGraphData }) {
  return <NarrativeGraphFlow data={data} />;
}
