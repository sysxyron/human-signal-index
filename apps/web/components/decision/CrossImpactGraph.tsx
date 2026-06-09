'use client';

// =============================================================================
// HSI Phase 13 — CrossImpactGraph. Client wrapper that loads the React Flow
// CrossImpactGraphFlow with ssr:false (React Flow touches the DOM: ResizeObserver
// etc.), mirroring the Phase-8 narrative-graph pattern.
// =============================================================================

import dynamic from 'next/dynamic';
import type {
  HsinCrossNarrativeImpactRecord,
  HsinNarrativeRecord,
} from '@hsi/shared-types';

const CrossImpactGraphFlow = dynamic(
  () => import('./CrossImpactGraphFlow').then((m) => m.CrossImpactGraphFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-card border border-border bg-background-deep/60 text-caption text-text-muted">
        Loading cross-narrative graph…
      </div>
    ),
  },
);

export function CrossImpactGraph({
  impacts,
  narratives,
}: {
  impacts: HsinCrossNarrativeImpactRecord[];
  narratives: HsinNarrativeRecord[];
}) {
  return <CrossImpactGraphFlow impacts={impacts} narratives={narratives} />;
}
