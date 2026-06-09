// =============================================================================
// HSI Phase 12 — DiffPanel. The DIFFERENCES between the original and the
// counterfactual timeline: signal Δ%, amplification Δ, whether the forecast
// state flipped, and window-growth Δ%. Plus the grounded event-level changes
// (action badge + impact + reasoning). Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { ArrowLeftRight, GitCompareArrows, Zap } from 'lucide-react';
import type { HsinCounterfactualEventRecord } from '@hsi/shared-types';
import { ActionBadge } from './badges';
import {
  formatDelta,
  formatDeltaPct,
  toneColor,
  deltaTone,
  type Tone,
  type CounterfactualDeltas,
  type CounterfactualChange,
} from '@/lib/simulation/view';

function DeltaChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const color = toneColor(tone);
  return (
    <div className="rounded-card border border-border bg-surface-2/40 p-3">
      <p className="text-label text-text-muted">{label}</p>
      <p className="mt-1 text-h5 font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

export function DiffPanel({
  deltas,
  changes,
  events,
}: {
  deltas: CounterfactualDeltas;
  /** Event-level changes parsed from results_json. */
  changes: CounterfactualChange[];
  /** Persisted counterfactual-event records (preferred when present). */
  events?: HsinCounterfactualEventRecord[];
}) {
  // Prefer persisted event records; fall back to results_json changes.
  const rows: CounterfactualChange[] =
    events && events.length > 0
      ? events.map((e) => ({
          originalEventId: e.original_event_id,
          eventType: e.original_event_id ?? 'event',
          action: e.action ?? 'changed',
          impactScore: e.impact_score ?? 0,
          reasoning: e.reasoning ?? '',
        }))
      : changes;

  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <GitCompareArrows className="h-4 w-4 text-electric" /> Differences
      </h3>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DeltaChip
          label="Signal volume Δ"
          value={formatDeltaPct(deltas.signalDeltaPct)}
          tone={deltaTone(deltas.signalDeltaPct)}
        />
        <DeltaChip
          label="Amplification Δ"
          value={formatDelta(deltas.amplificationDelta)}
          tone={deltaTone(deltas.amplificationDelta)}
        />
        <DeltaChip
          label="Window growth Δ"
          value={formatDeltaPct(deltas.growthDeltaPct)}
          tone={deltaTone(deltas.growthDeltaPct)}
        />
        <DeltaChip
          label="Forecast state"
          value={deltas.forecastChanged ? 'Changed' : 'Unchanged'}
          tone={deltas.forecastChanged ? 'purple' : 'neutral'}
        />
      </div>

      <div className="space-y-2">
        <h4 className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
          <ArrowLeftRight className="h-3.5 w-3.5 text-electric" /> Event changes applied
        </h4>
        {rows.length === 0 ? (
          <p className="text-caption text-text-muted">
            No discrete event changes — the intervention adjusted continuous terms only.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((c, i) => (
              <li
                key={c.originalEventId ?? i}
                className="space-y-1.5 rounded-card border border-border bg-surface-2/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ActionBadge action={c.action} />
                  <span className="inline-flex items-center gap-1 text-caption font-semibold text-text-secondary">
                    <Zap className="h-3.5 w-3.5 text-warning" /> Impact {Math.round(c.impactScore)}/100
                  </span>
                </div>
                {c.reasoning ? (
                  <p className="text-caption leading-relaxed text-text-secondary">
                    {c.reasoning}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
