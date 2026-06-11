// =============================================================================
// HSI Phase 16 — ConfidenceDriftChart. A deterministic SVG grouped-bar chart of
// prior vs current ECE across detected drift events, so a reader can SEE whether
// calibration error has grown (degradation), shrunk (improvement), or held
// (stable). Each pair is labelled with its drift kind and the exact ECE numbers.
// Explainable, never opaque. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { BarChart3, Info } from 'lucide-react';
import type { HsinConfidenceDriftRecord } from '@hsi/shared-types';
import { driftDecor, formatErrorPct, toneColor } from '@/lib/calibration/view';

export function ConfidenceDriftChart({
  drift,
  title = 'Drift — prior vs current ECE',
}: {
  drift: HsinConfidenceDriftRecord[];
  title?: string;
}) {
  const items = drift.slice(0, 6);
  // Scale: max ECE across both prior + current, with a floor so tiny bars show.
  const maxEce = Math.max(
    0.1,
    ...items.flatMap((d) => [d.current_ece ?? 0, d.prior_ece ?? 0]),
  );

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <BarChart3 className="h-4 w-4 text-electric" /> {title}
      </h3>
      <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
        Expected Calibration Error before and after, per detected drift event. Lower
        bars are better calibration; a current bar shorter than its prior is an
        improvement.
      </p>

      {items.length === 0 ? (
        <p className="text-caption text-text-muted">No drift events detected.</p>
      ) : (
        <div className="space-y-3">
          {items.map((d) => {
            const decor = driftDecor(d.drift_kind);
            const prior = d.prior_ece ?? 0;
            const current = d.current_ece ?? 0;
            return (
              <div key={d.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-caption">
                  <span className="font-medium" style={{ color: decor.color }}>
                    {decor.label}
                  </span>
                  <span className="text-text-muted">
                    {d.prior_ece == null ? 'no prior' : `${formatErrorPct(prior)} → `}
                    <span className="font-semibold text-text-primary">{formatErrorPct(current)}</span>
                  </span>
                </div>
                {/* prior bar */}
                {d.prior_ece != null ? (
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[10px] text-text-muted">prior</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (prior / maxEce) * 100)}%`,
                          backgroundColor: `${toneColor('neutral')}99`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {/* current bar */}
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[10px] text-text-muted">current</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (current / maxEce) * 100)}%`,
                        backgroundColor: decor.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
