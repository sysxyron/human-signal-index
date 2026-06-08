// =============================================================================
// HSI Phase 10 — Forecast UI primitives (server-safe):
//   * ProbabilityBar     — a stacked distribution bar over the 5 forecast states.
//   * ForecastReasoning   — the plain-language explanations for a forecast.
//   * ForecastStateColumn — a column grouping narratives by forecast_type.
//
// Forecasts are PROBABILISTIC, not certain — the UI says so everywhere.
// =============================================================================

import { Card } from '@hsi/ui';
import { Info, MessageSquareText } from 'lucide-react';
import type {
  HsinNarrativeForecastRecord,
  HsinNarrativeRecord,
  NarrativeForecastState,
} from '@hsi/shared-types';
import {
  FORECAST_STATE_ORDER,
  forecastStateDecor,
  formatProbability,
  readDistribution,
  readReasoning,
} from '@/lib/temporal/view';
import { ForecastStateBadge } from './Badges';

/** A stacked bar showing the full probability distribution over all 5 states. */
export function ProbabilityBar({
  distribution,
}: {
  distribution?: Record<string, unknown> | null;
}) {
  const dist = readDistribution(distribution);
  const total = FORECAST_STATE_ORDER.reduce((a, s) => a + (dist[s] ?? 0), 0) || 1;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
        {FORECAST_STATE_ORDER.map((state) => {
          const pct = ((dist[state] ?? 0) / total) * 100;
          if (pct <= 0) return null;
          const { color, label } = forecastStateDecor(state);
          return (
            <div
              key={state}
              style={{ width: `${pct}%`, backgroundColor: color }}
              title={`${label}: ${formatProbability(dist[state])}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
        {FORECAST_STATE_ORDER.map((state) => {
          const p = dist[state] ?? 0;
          if (p <= 0) return null;
          const { color, label } = forecastStateDecor(state);
          return (
            <span key={state} className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              {label} {formatProbability(p)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The plain-language reasoning behind a forecast. */
export function ForecastReasoning({
  reasoning,
}: {
  reasoning?: Record<string, unknown> | null;
}) {
  const lines = readReasoning(reasoning);
  if (lines.length === 0) {
    return (
      <p className="text-[11px] italic text-text-muted">No explanation recorded.</p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
        <MessageSquareText className="h-3 w-3" /> Why
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-text-secondary">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

/** A column grouping all narratives whose argmax forecast is `state`. */
export function ForecastStateColumn({
  state,
  forecasts,
  narratives,
}: {
  state: NarrativeForecastState;
  forecasts: HsinNarrativeForecastRecord[];
  narratives: HsinNarrativeRecord[];
}) {
  const names = new Map(narratives.map((n) => [n.id, n.name]));
  const decor = forecastStateDecor(state);
  const items = forecasts
    .filter((f) => f.forecast_type === state)
    .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));

  return (
    <Card className="flex flex-col gap-3" padded>
      <div className="flex items-center justify-between gap-2">
        <ForecastStateBadge state={state} />
        <span className="text-caption text-text-muted">{items.length}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-text-muted">{decor.description}</p>
      {items.length === 0 ? (
        <p className="text-[11px] italic text-text-muted">None in this state.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li
              key={f.id}
              className="space-y-2 rounded-card border border-border bg-surface-2/40 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className="min-w-0 truncate text-body-sm font-semibold text-text-primary"
                  title={names.get(f.narrative_id ?? '') ?? f.narrative_id}
                >
                  {names.get(f.narrative_id ?? '') ?? f.narrative_id}
                </span>
                <span
                  className="whitespace-nowrap font-mono text-body-sm font-bold"
                  style={{ color: decor.color }}
                  title="Probability of this state — never a certainty"
                >
                  ~{formatProbability(f.probability)}
                </span>
              </div>
              <ProbabilityBar distribution={f.distribution_json} />
              <ForecastReasoning reasoning={f.reasoning} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A shared "these are probabilistic" disclaimer banner. */
export function ProbabilisticNotice() {
  return (
    <Card className="flex items-start gap-2 border-electric/30 bg-electric/5" padded>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
      <p className="text-caption leading-relaxed text-text-secondary">
        These are <span className="font-semibold text-text-primary">probabilistic</span>{' '}
        trajectory forecasts — distributions over possible states, never certainties. Thin
        data widens the distribution and the reasoning says so. They are triage aids for a{' '}
        <span className="font-semibold text-text-primary">human</span> reviewer, not
        predictions of truth, and nothing here is ever auto-actioned.
      </p>
    </Card>
  );
}
