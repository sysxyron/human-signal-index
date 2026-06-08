'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import type { ClaimEvidenceGraph } from '@/lib/worldforge/evidence-intel-view';

// Dynamically import the React Flow graph with SSR disabled — reactflow touches
// the DOM and must only run on the client (mirrors DependencyGraphFlow usage).
const ClaimEvidenceGraphFlow = dynamic(
  () =>
    import('./ClaimEvidenceGraphFlow').then((m) => m.ClaimEvidenceGraphFlow),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[640px] w-full items-center justify-center rounded-card border border-border bg-background-deep/60">
        <span className="inline-flex items-center gap-2 text-caption text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading graph…
        </span>
      </div>
    ),
  },
);

export interface ClaimEvidenceGraphClientProps {
  graph: ClaimEvidenceGraph;
  className?: string;
}

/** Client boundary that lazy-loads the reactflow claim->evidence graph. */
export function ClaimEvidenceGraphClient({
  graph,
  className,
}: ClaimEvidenceGraphClientProps) {
  return <ClaimEvidenceGraphFlow graph={graph} className={className} />;
}
