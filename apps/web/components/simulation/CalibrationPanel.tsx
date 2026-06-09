// =============================================================================
// HSI Phase 12 — CalibrationPanel. Surfaces the aggregate calibration health
// (avg accuracy vs avg calibration) plus a per-band confidence display. The
// point of calibration is to REDUCE OVERCONFIDENCE — when stated confidence
// exceeds empirical accuracy, the band is flagged. Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { Gauge, Info } from 'lucide-react';
import { formatPct01, toneColor } from '@/lib/simulation/view';

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'green' | 'orange' | 'red' | 'blue';
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3">
      <p className="text-label text-text-muted">{label}</p>
      <p className="mt-1 text-h4 font-bold" style={{ color: toneColor(tone) }}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-caption text-text-muted">{hint}</p> : null}
    </div>
  );
}

function toneFor(v: number): 'green' | 'orange' | 'red' {
  return v >= 0.7 ? 'green' : v >= 0.4 ? 'orange' : 'red';
}

export function CalibrationPanel({
  avgAccuracy,
  avgCalibration,
  bands,
}: {
  avgAccuracy: number;
  avgCalibration: number;
  /** Optional per-band stated-vs-empirical confidence. */
  bands?: { window: string; stated: number; empirical: number }[];
}) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Gauge className="h-4 w-4 text-electric" /> Calibration health
        </h3>
        <span className="ml-auto text-caption text-text-muted">
          reduces overconfidence
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Avg forecast accuracy"
          value={formatPct01(avgAccuracy)}
          tone={toneFor(avgAccuracy)}
          hint="Share of forecasts whose state was correct."
        />
        <Stat
          label="Avg calibration"
          value={formatPct01(avgCalibration)}
          tone={toneFor(avgCalibration)}
          hint="1 = stated confidence matches reality."
        />
      </div>

      {bands && bands.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-body-sm font-semibold text-text-primary">
            Confidence by band — stated vs empirical
          </h4>
          <ul className="space-y-2">
            {bands.map((b) => {
              const overconfident = b.stated > b.empirical + 0.05;
              return (
                <li
                  key={b.window}
                  className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-2/40 p-2.5"
                >
                  <span className="text-caption font-medium text-text-primary">
                    {b.window}
                  </span>
                  <span className="text-caption text-text-muted">
                    stated{' '}
                    <span className="font-semibold text-text-secondary">
                      {formatPct01(b.stated)}
                    </span>
                  </span>
                  <span className="text-caption text-text-muted">
                    empirical{' '}
                    <span
                      className="font-semibold"
                      style={{ color: toneColor(toneFor(b.empirical)) }}
                    >
                      {formatPct01(b.empirical)}
                    </span>
                  </span>
                  {overconfident ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-caption font-semibold text-warning">
                      overconfident — pulled down
                    </span>
                  ) : (
                    <span className="ml-auto text-caption text-verified">
                      well calibrated
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <p className="flex items-start gap-2 text-caption leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-electric" />
        Calibration pulls overconfident bands down toward their empirical accuracy so a
        90%-stated forecast that is only ~50% right is reported honestly. Stated
        confidence is never taken at face value.
      </p>
    </Card>
  );
}
