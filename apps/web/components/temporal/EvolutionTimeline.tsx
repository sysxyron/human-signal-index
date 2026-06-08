// =============================================================================
// HSI Phase 10 — EvolutionTimeline. A vertical timeline of a narrative's
// snapshots (oldest → newest) interleaved with the typed evolution events
// (growth/decline/mutation/split/merge) that occurred between them. Server-safe.
// =============================================================================

import { Camera, GitCommitHorizontal } from 'lucide-react';
import type {
  HsinNarrativeEvolutionRecord,
  HsinNarrativeSnapshotRecord,
} from '@hsi/shared-types';
import {
  changeTypeDecor,
  formatDate,
  formatGrowthPct,
  formatProbability,
  readReasoning,
} from '@/lib/temporal/view';
import { ChangeTypeBadge } from './Badges';

export function EvolutionTimeline({
  snapshots,
  evolution,
}: {
  snapshots: HsinNarrativeSnapshotRecord[];
  evolution: HsinNarrativeEvolutionRecord[];
}) {
  const ordered = [...snapshots].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );
  // Index evolution by the child snapshot it produced.
  const evoByChild = new Map<string, HsinNarrativeEvolutionRecord>();
  for (const e of evolution) {
    if (e.child_snapshot_id) evoByChild.set(e.child_snapshot_id, e);
  }

  if (ordered.length === 0) {
    return <p className="text-caption text-text-muted">No snapshots captured yet.</p>;
  }

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {ordered.map((s, i) => {
        const evo = evoByChild.get(s.id);
        const decor = evo ? changeTypeDecor(evo.change_type) : null;
        const dotColor = decor?.color ?? '#475569';
        const reasoning = evo ? readReasoning(evo.reasoning_json) : [];
        return (
          <li key={s.id} className="relative">
            <span
              className="absolute -left-[26px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border"
              style={{
                backgroundColor: `${dotColor}33`,
                borderColor: dotColor,
              }}
            />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-text-secondary">
                  {i === 0 ? (
                    <Camera className="h-3.5 w-3.5 text-text-muted" />
                  ) : (
                    <GitCommitHorizontal className="h-3.5 w-3.5 text-text-muted" />
                  )}
                  {formatDate(s.captured_at)}
                </span>
                {evo ? <ChangeTypeBadge type={evo.change_type} /> : null}
                {evo && evo.growth_pct != null ? (
                  <span className="font-mono text-caption font-semibold text-text-secondary">
                    {formatGrowthPct(evo.growth_pct)} signals
                  </span>
                ) : null}
                {evo && evo.confidence != null ? (
                  <span className="text-[11px] text-text-muted">
                    {formatProbability(evo.confidence)} confidence
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-text-muted">
                <span>{s.signal_count ?? 0} signals</span>
                <span>{s.source_count ?? 0} sources</span>
                <span>{s.community_count ?? 0} communities</span>
                <span>amp {Math.round(s.amplification_score ?? 0)}</span>
              </div>
              {reasoning.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-text-secondary">
                  {reasoning.map((r, ri) => (
                    <li key={ri}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
