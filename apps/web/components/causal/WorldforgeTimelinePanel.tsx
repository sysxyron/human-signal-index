// =============================================================================
// HSI Phase 11 — WorldforgeTimelinePanel. Server-safe panel for the WorldForge
// fusion page: a narrative's historical EPOCHS, its TURNING POINTS (lifecycle
// milestones), and grounded COUNTERFACTUAL SEEDS ("What if the amplification
// spike never occurred?") to seed world-model exploration. Descriptive only —
// the seeds are prompts for a human, never auto-run hypotheses.
// =============================================================================

import { Card } from '@hsi/ui';
import { Clock3, GitFork, FlaskConical, Info } from 'lucide-react';
import type { WorldforgeTimeline } from '@hsi/shared-types';
import { DemoBadge } from '@/components/signals/badges';
import { MilestoneBadge } from './CausalEventBadge';
import { formatDate } from '@/lib/causal/view';

export function WorldforgeTimelinePanel({
  timeline,
  narrativeName,
  demo = false,
}: {
  timeline: WorldforgeTimeline;
  narrativeName?: string;
  demo?: boolean;
}) {
  const hasContent =
    timeline.epochs.length > 0 ||
    timeline.turningPoints.length > 0 ||
    timeline.counterfactualSeeds.length > 0;

  if (!hasContent) return null;

  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Clock3 className="h-4 w-4 text-electric" /> Narrative timeline
        </h3>
        {narrativeName ? (
          <span className="text-caption text-text-muted">{narrativeName}</span>
        ) : null}
        {demo ? <DemoBadge /> : null}
      </div>

      {/* Epochs */}
      {timeline.epochs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-label text-text-muted">Historical epochs</p>
          <div className="space-y-1.5">
            {timeline.epochs.map((ep, i) => (
              <div
                key={`${ep.label}-${i}`}
                className="rounded-card border border-border bg-surface-2/40 p-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption font-semibold text-text-primary">
                    {ep.label}
                  </span>
                  <span className="ml-auto font-mono text-caption text-text-muted">
                    {formatDate(ep.startAt)}
                    {ep.endAt ? ` → ${formatDate(ep.endAt)}` : ''}
                  </span>
                </div>
                {ep.summary ? (
                  <p className="mt-0.5 text-caption leading-relaxed text-text-secondary">
                    {ep.summary}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Turning points */}
      {timeline.turningPoints.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-label text-text-muted">
            <GitFork className="h-3.5 w-3.5" /> Turning points
          </p>
          <ul className="space-y-1.5">
            {timeline.turningPoints.map((tp, i) => (
              <li
                key={`${tp.at}-${i}`}
                className="flex flex-wrap items-center gap-2 text-caption"
              >
                {tp.milestoneType ? <MilestoneBadge type={tp.milestoneType} /> : null}
                <span className="text-text-secondary">{tp.description}</span>
                <span className="ml-auto font-mono text-text-muted">
                  {formatDate(tp.at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Counterfactual seeds */}
      {timeline.counterfactualSeeds.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-label text-text-muted">
            <FlaskConical className="h-3.5 w-3.5" /> Counterfactual seeds
          </p>
          <div className="space-y-1.5">
            {timeline.counterfactualSeeds.map((seed, i) => (
              <div
                key={`${seed.prompt}-${i}`}
                className="rounded-card border border-accent/30 bg-accent/5 p-2.5"
              >
                <p className="text-caption font-semibold text-accent">{seed.prompt}</p>
                {seed.basis ? (
                  <p className="mt-0.5 text-caption leading-relaxed text-text-secondary">
                    Grounded in: {seed.basis}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="flex items-start gap-1.5 text-caption text-text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Seeds are exploration prompts for a human researcher — the network never
            auto-runs a counterfactual or publishes a hypothesis.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
