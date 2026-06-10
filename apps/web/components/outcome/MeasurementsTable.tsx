// =============================================================================
// HSI Phase 15 — MeasurementsTable. The per-metric expected-vs-observed evidence
// behind an outcome verdict: metric, expected value, observed value, signed delta,
// and whether it fell WITHIN expectation. This is the grounding for the success
// score — a reader can trace exactly which metrics moved as predicted and which did
// not. Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { Ruler, Check, X } from 'lucide-react';
import type { HsinOutcomeMeasurementRecord } from '@hsi/shared-types';
import { formatDelta, interventionLabel, toneColor } from '@/lib/outcome/view';

function fmt(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return String(Number(value.toFixed(3)));
}

export function MeasurementsTable({
  measurements,
  title = 'Measurements (expected vs observed)',
}: {
  measurements: HsinOutcomeMeasurementRecord[];
  title?: string;
}) {
  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Ruler className="h-4 w-4 text-electric" /> {title}
      </h3>

      {measurements.length === 0 ? (
        <p className="text-caption text-text-muted">
          No per-metric measurements were recorded for this outcome.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-label text-text-muted">
                <th className="py-2 pr-3 font-medium">Metric</th>
                <th className="py-2 pr-3 text-right font-medium">Expected</th>
                <th className="py-2 pr-3 text-right font-medium">Observed</th>
                <th className="py-2 pr-3 text-right font-medium">Delta</th>
                <th className="py-2 pr-0 text-right font-medium">Within expectation</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => {
                const within = m.within_expectation === true;
                const color = within ? toneColor('green') : toneColor('red');
                return (
                  <tr
                    key={m.id}
                    className="border-b border-border/60 last:border-0 hover:bg-surface-2/30"
                  >
                    <td className="py-2.5 pr-3 text-body-sm text-text-primary">
                      {interventionLabel(m.metric)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-caption text-text-secondary">
                      {fmt(m.expected_value)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-caption text-text-secondary">
                      {fmt(m.observed_value)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-caption font-semibold text-text-primary">
                      {formatDelta(m.delta, 3)}
                    </td>
                    <td className="py-2.5 pr-0 text-right">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
                      >
                        {within ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {within ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
