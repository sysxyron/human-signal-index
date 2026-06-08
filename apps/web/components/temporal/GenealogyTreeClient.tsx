'use client';

// =============================================================================
// HSI Phase 10 — GenealogyTreeClient. Client wrapper that loads the React Flow
// GenealogyTreeFlow with ssr:false (React Flow touches the DOM: ResizeObserver
// etc.), mirroring the Phase-9 community-graph pattern.
// =============================================================================

import dynamic from 'next/dynamic';
import type { GenealogyView } from '@hsi/shared-types';

const GenealogyTreeFlow = dynamic(
  () => import('./GenealogyTreeFlow').then((m) => m.GenealogyTreeFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-card border border-border bg-background-deep/60 text-caption text-text-muted">
        Loading genealogy tree…
      </div>
    ),
  },
);

export function GenealogyTreeClient({ view }: { view: GenealogyView }) {
  return <GenealogyTreeFlow view={view} />;
}
