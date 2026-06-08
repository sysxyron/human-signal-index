// =============================================================================
// HSI Phase 11 — MilestoneTimeline. Server-safe vertical lifecycle timeline
// (birth → growth → viral → peak → decline → death → resurgence) for a
// narrative: milestone badge, data-grounded description, confidence and date,
// connected by a spine. Used on the replay page + reused by the WorldForge panel.
// =============================================================================

import type { HsinNarrativeMilestoneRecord } from '@hsi/shared-types';
import { MilestoneBadge } from './CausalEventBadge';
import {
  formatConfidence,
  formatDate,
  milestoneDecor,
} from '@/lib/causal/view';

export function MilestoneTimeline({
  milestones,
  emptyHint = 'No lifecycle milestones detected for this narrative.',
}: {
  milestones: HsinNarrativeMilestoneRecord[];
  emptyHint?: string;
}) {
  const ordered = [...milestones].sort(
    (a, b) =>
      Date.parse(a.occurred_at ?? a.created_at) -
      Date.parse(b.occurred_at ?? b.created_at),
  );

  if (ordered.length === 0) {
    return <p className="text-caption text-text-muted">{emptyHint}</p>;
  }

  return (
    <ol className="relative space-y-4 pl-5">
      <span
        aria-hidden
        className="absolute left-[7px] top-1 bottom-1 w-px bg-border"
      />
      {ordered.map((m) => {
        const decor = milestoneDecor(m.milestone_type);
        return (
          <li key={m.id} className="relative">
            <span
              className="absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2"
              style={{ backgroundColor: decor.color, borderColor: `${decor.color}55` }}
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <MilestoneBadge type={m.milestone_type} />
                <span className="font-mono text-caption text-text-muted">
                  {formatDate(m.occurred_at ?? m.created_at)}
                </span>
                <span className="ml-auto text-caption text-text-muted">
                  {formatConfidence(m.confidence)} conf.
                </span>
              </div>
              {m.description ? (
                <p className="text-caption leading-relaxed text-text-secondary">
                  {m.description}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
