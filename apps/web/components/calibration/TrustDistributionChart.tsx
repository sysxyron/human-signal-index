// =============================================================================
// HSI Phase 16 — TrustDistributionChart. A deterministic SVG histogram of trust
// scores across a set of entities (5 buckets of 20 points), coloured by band, so
// a reader can see how trust is distributed (mostly-high vs mostly-low) and where
// the entity in focus sits. Counts are labelled — explainable. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { BarChart3, Info } from 'lucide-react';
import { bandDecor, bandFromScore, type TrustHistogramBucket } from '@/lib/calibration/view';

export function TrustDistributionChart({
  buckets,
  highlightScore,
  title = 'Trust distribution',
}: {
  buckets: TrustHistogramBucket[];
  highlightScore?: number | null;
  title?: string;
}) {
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const highlightBucket =
    highlightScore == null
      ? -1
      : buckets.findIndex((b, i) =>
          i === buckets.length - 1
            ? highlightScore >= b.lower && highlightScore <= b.upper
            : highlightScore >= b.lower && highlightScore < b.upper,
        );

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <BarChart3 className="h-4 w-4 text-electric" /> {title}
      </h3>
      <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
        How trust is distributed across {total} tracked {total === 1 ? 'entity' : 'entities'}.
        {highlightScore != null ? ' The highlighted bucket holds the entity in focus.' : ''}
      </p>

      {total === 0 ? (
        <p className="text-caption text-text-muted">No trusted entities to chart.</p>
      ) : (
        <div className="flex items-end gap-2" style={{ height: 140 }}>
          {buckets.map((b, i) => {
            const mid = (b.lower + b.upper) / 2;
            const color = bandDecor(bandFromScore(mid)).color;
            const h = (b.count / maxCount) * 110;
            const isHighlight = i === highlightBucket;
            return (
              <div key={b.label} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-text-secondary">{b.count}</span>
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: Math.max(2, h),
                    backgroundColor: color,
                    opacity: isHighlight ? 1 : 0.55,
                    outline: isHighlight ? `2px solid ${color}` : 'none',
                    outlineOffset: 2,
                  }}
                  title={`${b.label}: ${b.count} ${b.count === 1 ? 'entity' : 'entities'}`}
                />
                <span className="text-[10px] text-text-muted">{b.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-caption text-text-muted">x = trust score band (0–100), y = number of entities.</p>
    </Card>
  );
}
