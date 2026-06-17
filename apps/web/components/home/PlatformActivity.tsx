'use client';

// =============================================================================
// HSI Phase 42 — "Current Platform Activity" strip shown above the footer.
// =============================================================================

import { Activity } from 'lucide-react';
import { AnimatedMetric, type MetricSpec } from './AnimatedMetric';
import { Reveal } from './motion';

export function PlatformActivity({ metrics }: { metrics: MetricSpec[] }) {
  return (
    <Reveal>
      <div className="rounded-card border border-border bg-surface/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-electric" />
          <h2 className="text-label uppercase tracking-wide text-text-muted">Current platform activity</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => <AnimatedMetric key={m.label} spec={m} />)}
        </div>
      </div>
    </Reveal>
  );
}
