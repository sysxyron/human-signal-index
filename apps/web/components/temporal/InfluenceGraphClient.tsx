'use client';

// =============================================================================
// HSI Phase 10 — InfluenceGraphClient. Client wrapper loading the React Flow
// InfluenceGraphFlow with ssr:false (React Flow touches the DOM), mirroring the
// Phase-9 community-graph pattern.
// =============================================================================

import dynamic from 'next/dynamic';
import type { InfluenceView } from '@hsi/shared-types';

const InfluenceGraphFlow = dynamic(
  () => import('./InfluenceGraphFlow').then((m) => m.InfluenceGraphFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-card border border-border bg-background-deep/60 text-caption text-text-muted">
        Loading influence network…
      </div>
    ),
  },
);

export function InfluenceGraphClient({ view }: { view: InfluenceView }) {
  return <InfluenceGraphFlow view={view} />;
}
