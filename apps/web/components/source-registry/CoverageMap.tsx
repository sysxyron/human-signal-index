// =============================================================================
// HSI Phase 46 — Source coverage map. Shows how the source pool contributes by
// narrative category (signals + contributing sources). Read-only, real counts.
// =============================================================================

import { Card } from '@hsi/ui';
import { Layers } from 'lucide-react';
import { colorForBucket } from '@/lib/public-intelligence-mapping';
import type { SourceCoverage } from '@/lib/source-intelligence';

export function CoverageMap({ coverage }: { coverage: SourceCoverage[] }) {
  const max = Math.max(1, ...coverage.map((c) => c.signals));
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-electric" />
        <h3 className="text-h6 font-semibold text-text-primary">Coverage by category</h3>
      </div>
      {coverage.length === 0 ? (
        <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-6 text-center text-caption text-text-muted">
          No source coverage data yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {coverage.map((c) => {
            const color = colorForBucket(c.category);
            const pct = Math.round((c.signals / max) * 100);
            return (
              <li key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-caption">
                  <span className="flex items-center gap-2 font-medium text-text-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {c.category}
                  </span>
                  <span className="text-text-muted">
                    <span className="font-semibold text-text-primary tabular-nums">{c.signals.toLocaleString('en-US')}</span> signals · {c.sources} {c.sources === 1 ? 'source' : 'sources'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
