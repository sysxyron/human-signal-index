'use client';

// =============================================================================
// HSI Phase 43 — "Current Platform Activity" strip shown above the footer. Now
// driven by REAL computed values (active signals, under review, published today,
// traceability). Count-up animation respects reduced motion via AnimatedMetric.
// =============================================================================

import { Activity } from 'lucide-react';
import { AnimatedMetric, type MetricSpec } from './AnimatedMetric';
import { Reveal } from './motion';
import type { PublicActivityBar } from '@/lib/public-intelligence';

export function PlatformActivity({ bar }: { bar: PublicActivityBar }) {
  const specs: MetricSpec[] = [
    { label: 'Active signals', value: bar.activeSignals, format: 'count', accent: '#3B82F6' },
    { label: 'Under review', value: bar.underReview, format: 'count', accent: '#F59E0B' },
    { label: 'Published today', value: bar.publishedToday, format: 'count', accent: '#10B981' },
    { label: 'Traceability', value: bar.traceabilityScore, format: 'percent', accent: '#10B981' },
  ];
  return (
    <Reveal>
      <div className="rounded-card border border-border bg-surface/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-electric" />
          <h2 className="text-label uppercase tracking-wide text-text-muted">Current platform activity</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {specs.map((m) => <AnimatedMetric key={m.label} spec={m} />)}
        </div>
      </div>
    </Reveal>
  );
}
