'use client';

// =============================================================================
// HSI Phase 9 — CommunityGraphClient. Client wrapper that loads the React Flow
// CommunityGraphFlow with ssr:false (React Flow touches the DOM: ResizeObserver
// etc.), mirroring the WorldForge dependency-graph + narrative-graph pattern.
// =============================================================================

import dynamic from 'next/dynamic';
import type { CommunitiesView } from '@hsi/shared-types';

const CommunityGraphFlow = dynamic(
  () => import('./CommunityGraphFlow').then((m) => m.CommunityGraphFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-card border border-border bg-background-deep/60 text-caption text-text-muted">
        Loading community graph…
      </div>
    ),
  },
);

export function CommunityGraphClient({ view }: { view: CommunitiesView }) {
  return <CommunityGraphFlow view={view} />;
}
