// =============================================================================
// HSI Phase 15 — ConfidenceDeltaChip. Renders the confidence UPDATE for an
// outcome: the stated confidence BEFORE the observation → the calibrated
// confidence AFTER, with a signed delta and an ↑/↓ direction. This is the heart of
// the learning loop — confidence is never hidden and never claimed as certainty;
// it visibly rises when a recommendation works and falls when it does not.
// Server-safe / presentational.
// =============================================================================

import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  deltaDirection,
  formatConfidence,
  formatConfidenceDelta,
  toneColor,
} from '@/lib/outcome/view';

export function ConfidenceDeltaChip({
  before,
  after,
  compact = false,
}: {
  before?: number | null;
  after?: number | null;
  compact?: boolean;
}) {
  const dir = deltaDirection(before, after);
  const color =
    dir === 'up' ? toneColor('green') : dir === 'down' ? toneColor('red') : toneColor('neutral');
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ backgroundColor: `${color}1f`, color, border: `1px solid ${color}55` }}
        title={`Confidence ${formatConfidence(before)} → ${formatConfidence(after)}`}
      >
        <Icon className="h-3 w-3" />
        {formatConfidenceDelta(before, after)}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface-2/40 px-3 py-1 text-caption font-semibold"
      title="Confidence before → after the observed outcome. This is the learning update."
    >
      <span className="text-text-secondary">{formatConfidence(before)}</span>
      <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
      <span className="text-text-primary">{formatConfidence(after)}</span>
      <span className="inline-flex items-center gap-1" style={{ color }}>
        <Icon className="h-3.5 w-3.5" />
        {formatConfidenceDelta(before, after)}
      </span>
    </span>
  );
}
