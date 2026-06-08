// =============================================================================
// HSI Phase 10 — EvolutionNarrativeCard. Per-narrative evolution card: the
// prominent net growth %, the latest change-type badge, velocity & trend, the
// snapshot timeline, and a LineChart of signal_count / amplification over the
// narrative's snapshots. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { History } from 'lucide-react';
import type {
  HsinNarrativeEvolutionRecord,
  HsinNarrativeRecord,
  HsinNarrativeSnapshotRecord,
} from '@hsi/shared-types';
import { EvolutionTimeline } from './EvolutionTimeline';
import { EvolutionChart } from './EvolutionChart';
import { ChangeTypeBadge, GrowthDelta } from './Badges';

/** Net signal growth across the full snapshot history (first → last). */
function netGrowthPct(snapshots: HsinNarrativeSnapshotRecord[]): number | undefined {
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );
  if (ordered.length < 2) return undefined;
  const first = ordered[0].signal_count ?? 0;
  const last = ordered[ordered.length - 1].signal_count ?? 0;
  return ((last - first) / Math.max(1, first)) * 100;
}

/** A coarse trend label from the most recent change type. */
function trendLabel(latest?: HsinNarrativeEvolutionRecord): string {
  switch (latest?.change_type) {
    case 'growth':
      return 'Trending up';
    case 'decline':
      return 'Trending down';
    case 'split':
      return 'Fragmenting';
    case 'merge':
      return 'Consolidating';
    case 'mutation':
      return 'Shifting shape';
    default:
      return 'Stable';
  }
}

export function EvolutionNarrativeCard({
  narrative,
  snapshots,
  evolution,
}: {
  narrative: HsinNarrativeRecord;
  snapshots: HsinNarrativeSnapshotRecord[];
  evolution: HsinNarrativeEvolutionRecord[];
}) {
  const ordered = [...evolution].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
  const latest = ordered[ordered.length - 1];
  const net = netGrowthPct(snapshots);

  // Velocity: signals added per day across the snapshot span.
  const sortedSnaps = [...snapshots].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );
  let velocity: number | undefined;
  if (sortedSnaps.length >= 2) {
    const first = sortedSnaps[0];
    const last = sortedSnaps[sortedSnaps.length - 1];
    const days = Math.max(
      1,
      (Date.parse(last.captured_at) - Date.parse(first.captured_at)) / 86_400_000,
    );
    velocity = ((last.signal_count ?? 0) - (first.signal_count ?? 0)) / days;
  }

  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <History className="h-4 w-4 text-electric" />
            <span className="truncate" title={narrative.name}>
              {narrative.name}
            </span>
          </h3>
          <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
            {narrative.category ? (
              <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5">
                {narrative.category}
              </span>
            ) : null}
            <span>{trendLabel(latest)}</span>
            {velocity != null ? (
              <span className="font-mono">
                {velocity > 0 ? '+' : ''}
                {velocity.toFixed(1)} signals/day
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <GrowthDelta pct={net} size="lg" />
          <span className="text-[11px] text-text-muted">net signal growth</span>
          {latest ? <ChangeTypeBadge type={latest.change_type} /> : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-label text-text-muted">Snapshot timeline</p>
          <EvolutionTimeline snapshots={snapshots} evolution={evolution} />
        </div>
        <div className="space-y-2">
          <p className="text-label text-text-muted">Signals &amp; amplification</p>
          <EvolutionChart snapshots={snapshots} />
        </div>
      </div>
    </Card>
  );
}
