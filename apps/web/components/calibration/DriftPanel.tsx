// =============================================================================
// HSI Phase 16 — DriftPanel. Surfaces the current confidence-drift detection:
// the drift KIND (over/under/degradation/improvement/stable), its magnitude,
// current vs prior ECE, the human-readable explanation, and the advisory
// RECOMMENDATION. Drift only RECOMMENDS recalibration — it never auto-corrects
// confidence. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Activity, ArrowRight } from 'lucide-react';
import type { HsinConfidenceDriftRecord } from '@hsi/shared-types';
import { DriftBadge } from '@/components/calibration/badges';
import { driftDecor, formatErrorPct } from '@/lib/calibration/view';

export function DriftPanel({
  drift,
  title = 'Confidence drift',
}: {
  drift: HsinConfidenceDriftRecord;
  title?: string;
}) {
  const decor = driftDecor(drift.drift_kind);

  return (
    <Card className="space-y-3" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Activity className="h-4 w-4 text-electric" /> {title}
        </h3>
        <DriftBadge kind={drift.drift_kind} />
      </div>

      {decor.description ? (
        <p className="text-caption leading-relaxed text-text-secondary">{decor.description}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-surface-2/40 p-2.5">
          <p className="text-label text-text-muted">Magnitude</p>
          <p className="text-body-sm font-semibold text-text-primary">
            {drift.magnitude == null ? '—' : Number(drift.magnitude.toFixed(2))}
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-2/40 p-2.5">
          <p className="text-label text-text-muted">Current ECE</p>
          <p className="text-body-sm font-semibold text-text-primary">
            {formatErrorPct(drift.current_ece)}
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-2/40 p-2.5">
          <p className="text-label text-text-muted">Prior ECE</p>
          <p className="flex items-center gap-1 text-body-sm font-semibold text-text-primary">
            {drift.prior_ece == null ? (
              '—'
            ) : (
              <>
                {formatErrorPct(drift.prior_ece)}
                <ArrowRight className="h-3 w-3 text-text-muted" />
                {formatErrorPct(drift.current_ece)}
              </>
            )}
          </p>
        </div>
      </div>

      {drift.explanation ? (
        <p className="text-caption leading-relaxed text-text-secondary">{drift.explanation}</p>
      ) : null}

      {drift.recommendation ? (
        <div
          className="rounded-card border px-3 py-2 text-caption font-medium"
          style={{ borderColor: `${decor.color}55`, backgroundColor: `${decor.color}12`, color: decor.color }}
        >
          Recommendation (advisory): {drift.recommendation}
        </div>
      ) : null}
    </Card>
  );
}
