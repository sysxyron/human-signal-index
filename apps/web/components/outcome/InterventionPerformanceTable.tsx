// =============================================================================
// HSI Phase 15 — InterventionPerformanceTable. Ranks intervention types by their
// learned average success score (0..100) over real outcome history — used for both
// the TOP-performing and WORST-performing tables. Each row shows the avg success
// score (as a bar) and the sample count so a reader knows how much evidence backs
// the ranking. Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { SuccessScoreBar } from './SuccessScore';
import { interventionLabel } from '@/lib/outcome/view';

interface InterventionPerformance {
  interventionType: string;
  avgSuccessScore: number;
  sampleCount: number;
}

export function InterventionPerformanceTable({
  interventions,
  variant,
  title,
}: {
  interventions: InterventionPerformance[];
  variant: 'top' | 'worst';
  title?: string;
}) {
  const Icon: LucideIcon = variant === 'top' ? TrendingUp : TrendingDown;
  const accent = variant === 'top' ? '#10B981' : '#EF4444';
  const heading =
    title ?? (variant === 'top' ? 'Top-performing interventions' : 'Worst-performing interventions');

  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Icon className="h-4 w-4" style={{ color: accent }} /> {heading}
      </h3>

      {interventions.length === 0 ? (
        <p className="text-caption text-text-muted">
          No learned interventions yet — record outcomes and recompute learning.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {interventions.map((i, idx) => (
            <li key={`${i.interventionType}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-body-sm font-medium text-text-primary">
                  {interventionLabel(i.interventionType)}
                </span>
                <span className="shrink-0 text-caption text-text-muted">
                  {i.sampleCount} sample{i.sampleCount === 1 ? '' : 's'}
                </span>
              </div>
              <SuccessScoreBar score={i.avgSuccessScore} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-text-muted">
        Ranked by learned average success score over observed outcomes — more samples
        means a more reliable ranking.
      </p>
    </Card>
  );
}
