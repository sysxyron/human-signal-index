// =============================================================================
// HSI Phase 10 — NarrativeHistoryPanel. A COMPACT temporal-history panel for the
// WorldForge fusion bridge: the most recent snapshots, the latest evolution
// change, and the (probabilistic) forecast for the narrative feeding a world
// hypothesis. Server-safe. Used additively — the page hides it on any failure.
// =============================================================================

import { Card } from '@hsi/ui';
import { History } from 'lucide-react';
import type { NarrativeHistory } from '@hsi/shared-types';
import {
  formatDate,
  formatGrowthPct,
  formatProbability,
  readReasoning,
} from '@/lib/temporal/view';
import { DemoBadge } from '@/components/signals/badges';
import { ChangeTypeBadge, ForecastStateBadge } from './Badges';

export function NarrativeHistoryPanel({
  history,
  demo = false,
}: {
  history: NarrativeHistory;
  demo?: boolean;
}) {
  const snapshots = [...history.snapshots].sort(
    (a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at),
  );
  const latestSnap = snapshots[0];
  const latestEvo = [...history.evolution].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  const forecast = history.forecast;

  const hasAnything =
    snapshots.length > 0 || Boolean(latestEvo) || Boolean(forecast);
  if (!hasAnything) return null;

  return (
    <Card className="space-y-3 border-electric/20 bg-surface/40" padded>
      <div className="flex items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <History className="h-4 w-4 text-electric" /> Narrative history
        </h3>
        {demo ? <DemoBadge /> : null}
      </div>
      <p className="text-[11px] leading-relaxed text-text-muted">
        Temporal context feeding this hypothesis — descriptive history &amp; a probabilistic
        forecast, never a certainty.
      </p>

      {latestSnap ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-card border border-border bg-surface-2/40 p-2.5 text-[11px] text-text-secondary">
          <span className="font-semibold text-text-primary">
            Latest snapshot · {formatDate(latestSnap.captured_at)}
          </span>
          <span>{latestSnap.signal_count ?? 0} signals</span>
          <span>{latestSnap.source_count ?? 0} sources</span>
          <span>{latestSnap.community_count ?? 0} communities</span>
          <span>amp {Math.round(latestSnap.amplification_score ?? 0)}</span>
        </div>
      ) : null}

      {latestEvo ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
          <span className="font-semibold text-text-primary">Recent change:</span>
          <ChangeTypeBadge type={latestEvo.change_type} />
          {latestEvo.growth_pct != null ? (
            <span className="font-mono">{formatGrowthPct(latestEvo.growth_pct)} signals</span>
          ) : null}
        </div>
      ) : null}

      {forecast ? (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
            <span className="font-semibold text-text-primary">Forecast:</span>
            <ForecastStateBadge state={forecast.forecast_type} />
            <span className="font-mono" title="Probability — not a certainty">
              ~{formatProbability(forecast.probability)}
            </span>
          </div>
          {readReasoning(forecast.reasoning).slice(0, 2).map((r, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-text-muted">
              {r}
            </p>
          ))}
        </div>
      ) : null}

      <p className="text-[10px] text-text-muted">
        Snapshots: {history.snapshots.length} · evolution events: {history.evolution.length} ·
        lineage edges: {history.genealogy.length}
      </p>
    </Card>
  );
}
