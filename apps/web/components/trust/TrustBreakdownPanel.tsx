// =============================================================================
// HSI Phase 17 — TrustBreakdownPanel. The transparent metric breakdown for a
// public-trust entry: Trust Score, Reliability, Calibration Quality, Outcome
// Accuracy, Evidence Quality, and Governance History — each shown with its value
// and a bar. No black-box scores. Pure presentational, server-safe.
// =============================================================================

import type { PublicTrustEntry } from '@hsi/shared-types';

function MetricBar({
  label,
  value,
  display,
  color,
}: {
  label: string;
  value: number; // 0..1 for the bar fill
  display: string;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-caption">
        <span className="text-text-secondary">{label}</span>
        <span className="font-semibold tabular-nums text-text-primary">{display}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function TrustBreakdownPanel({ entry }: { entry: PublicTrustEntry }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MetricBar
        label="Trust score"
        value={entry.trustScore / 100}
        display={`${Math.round(entry.trustScore)}/100`}
        color="#3B82F6"
      />
      <MetricBar
        label="Reliability"
        value={entry.reliability}
        display={`${Math.round(entry.reliability * 100)}%`}
        color="#10B981"
      />
      <MetricBar
        label="Calibration quality"
        value={entry.calibrationQuality}
        display={`${Math.round(entry.calibrationQuality * 100)}%`}
        color="#06B6D4"
      />
      <MetricBar
        label="Outcome accuracy"
        value={entry.outcomeAccuracy}
        display={`${Math.round(entry.outcomeAccuracy * 100)}%`}
        color="#8B5CF6"
      />
      <MetricBar
        label="Evidence quality"
        value={entry.evidenceQuality}
        display={`${Math.round(entry.evidenceQuality * 100)}%`}
        color="#F59E0B"
      />
      <MetricBar
        label="Governance history"
        value={Math.min(1, entry.governanceHistoryCount / 5)}
        display={`${entry.governanceHistoryCount} action${entry.governanceHistoryCount === 1 ? '' : 's'}`}
        color="#EC4899"
      />
    </div>
  );
}
