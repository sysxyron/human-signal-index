// =============================================================================
// HSI Phase 16 — BrierScoreCard. Shows a Brier score (mean squared error of
// confidence vs outcome; LOWER is better, 0..1) with its quality badge, its
// interpretation sentence, the sample count, and — when present — the Murphy
// reliability/resolution/uncertainty decomposition. Explainable, never opaque.
// Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Gauge } from 'lucide-react';
import type { HsinBrierScoreRecord } from '@hsi/shared-types';
import { CalibrationQualityBadge } from '@/components/calibration/badges';
import {
  brierQuality,
  formatBrier,
  formatRate,
  readBrierDecomposition,
} from '@/lib/calibration/view';

export function BrierScoreCard({
  brier,
  title,
}: {
  brier: HsinBrierScoreRecord;
  title?: string;
}) {
  const quality = brier.calibration_quality ?? brierQuality(brier.score, brier.sample_count);
  const decomposition = readBrierDecomposition(brier.decomposition);
  const heading = title ?? `Brier score${brier.kind && brier.kind !== 'all' ? ` · ${brier.kind}` : ''}`;

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Gauge className="h-4 w-4 text-electric" /> {heading}
        </h3>
        <CalibrationQualityBadge quality={quality} />
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight text-text-primary">
          {formatBrier(brier.score)}
        </span>
        <span className="mb-1 text-caption text-text-muted">
          0 = perfect · {brier.sample_count ?? 0} observations
        </span>
      </div>

      {brier.interpretation ? (
        <p className="text-caption leading-relaxed text-text-secondary">
          {brier.interpretation}
        </p>
      ) : (
        <p className="text-caption leading-relaxed text-text-secondary">
          The Brier score is the mean squared error between stated confidence and the
          observed 0/1 outcome — lower means confidence tracked reality more closely.
        </p>
      )}

      {decomposition ? (
        <div className="grid grid-cols-3 gap-2 pt-1">
          {(
            [
              ['Reliability', decomposition.reliability, 'lower = better'],
              ['Resolution', decomposition.resolution, 'higher = better'],
              ['Uncertainty', decomposition.uncertainty, 'baseline'],
            ] as const
          ).map(([label, value, hint]) => (
            <div
              key={label}
              className="rounded-card border border-border bg-surface-2/40 p-2.5 text-center"
            >
              <p className="text-label text-text-muted">{label}</p>
              <p className="text-body-sm font-semibold text-text-primary">
                {value == null ? '—' : formatRate(value, 1)}
              </p>
              <p className="text-[10px] text-text-muted">{hint}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
