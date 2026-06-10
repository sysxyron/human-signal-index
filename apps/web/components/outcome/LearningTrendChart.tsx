// =============================================================================
// HSI Phase 15 — LearningTrendChart. Renders the HISTORICAL LEARNING TRENDS: the
// calibrated confidence learned per intervention type from real outcome history.
// When there are enough points it draws a @hsi/ui LineChart of calibrated
// confidence across interventions (ordered by sample weight); otherwise it falls
// back to a labeled bar list. Explainable: each entry shows its sample count so a
// reader knows how much evidence backs the learned confidence. Server-safe.
// =============================================================================

import { Card, LineChart } from '@hsi/ui';
import { LineChart as LineChartIcon, Info } from 'lucide-react';
import { formatConfidence, interventionLabel, toneColor } from '@/lib/outcome/view';

interface LearningTrend {
  interventionType: string;
  calibratedConfidence: number;
  sampleCount: number;
}

export function LearningTrendChart({
  trends,
  title = 'Historical learning trends',
}: {
  trends: LearningTrend[];
  title?: string;
}) {
  // Order by sample weight (most-evidenced first) so the trend reads from the
  // best-supported intervention type onward.
  const ordered = [...trends].sort((a, b) => b.sampleCount - a.sampleCount);

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <LineChartIcon className="h-4 w-4 text-electric" /> {title}
      </h3>
      <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
        Calibrated confidence learned per intervention type from observed outcomes.
        Confidence rises for interventions that repeatedly work and falls for those
        that do not — this is the loop, not a certainty.
      </p>

      {ordered.length === 0 ? (
        <p className="text-caption text-text-muted">
          No learning history yet — record outcomes and recompute learning to populate
          this trend.
        </p>
      ) : ordered.length >= 3 ? (
        <LineChart
          series={[
            {
              name: 'Calibrated confidence',
              color: toneColor('green'),
              data: ordered.map((t) => Math.round(t.calibratedConfidence * 100)),
            },
          ]}
          height={200}
          xLabels={ordered.map((t) => interventionLabel(t.interventionType))}
          showLegend
        />
      ) : (
        <ul className="space-y-2">
          {ordered.map((t) => (
            <li key={t.interventionType} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-caption">
                <span className="text-text-secondary">
                  {interventionLabel(t.interventionType)}
                </span>
                <span className="font-semibold text-text-primary">
                  {formatConfidence(t.calibratedConfidence)}
                  <span className="ml-1 text-text-muted">· {t.sampleCount} samples</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(Math.max(0, Math.min(1, t.calibratedConfidence)) * 100)}%`,
                    backgroundColor: toneColor('green'),
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {ordered.length >= 3 ? (
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((t) => (
            <div
              key={t.interventionType}
              className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface-2/40 px-2.5 py-1.5"
            >
              <span className="truncate text-caption text-text-secondary" title={interventionLabel(t.interventionType)}>
                {interventionLabel(t.interventionType)}
              </span>
              <span className="shrink-0 text-caption font-semibold text-text-primary">
                {formatConfidence(t.calibratedConfidence)}
                <span className="ml-1 text-text-muted">· n={t.sampleCount}</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
