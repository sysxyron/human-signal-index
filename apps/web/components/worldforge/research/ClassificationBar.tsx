'use client';

import type { ScientificConfidenceTier } from '@hsi/research-agents';
import { TIER_ORDER, TIER_STYLES } from '@/lib/worldforge/confidence';

export interface ClassificationBarProps {
  /** Count of claims per scientific tier. */
  breakdown: Record<ScientificConfidenceTier, number>;
  /** Show the per-tier legend with counts. Default true. */
  showLegend?: boolean;
  className?: string;
}

/** Stacked 5-tier breakdown bar (green → red) + legend with counts. */
export function ClassificationBar({
  breakdown,
  showLegend = true,
  className = '',
}: ClassificationBarProps) {
  const total = TIER_ORDER.reduce((sum, t) => sum + (breakdown[t] ?? 0), 0);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
        {total === 0 ? (
          <div className="h-full w-full bg-surface-3" />
        ) : (
          TIER_ORDER.map((tier) => {
            const count = breakdown[tier] ?? 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            const s = TIER_STYLES[tier];
            return (
              <div
                key={tier}
                className="h-full"
                style={{ width: `${pct}%`, backgroundColor: s.color }}
                title={`${s.label}: ${count}`}
              />
            );
          })
        )}
      </div>

      {showLegend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {TIER_ORDER.map((tier) => {
            const count = breakdown[tier] ?? 0;
            const s = TIER_STYLES[tier];
            return (
              <span
                key={tier}
                className="inline-flex items-center gap-1.5 text-caption"
                style={{ opacity: count === 0 ? 0.45 : 1 }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-text-secondary">{s.label}</span>
                <span className="font-semibold text-text-primary">{count}</span>
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5 text-caption">
            <span className="text-text-muted">Total</span>
            <span className="font-semibold text-text-primary">{total}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
