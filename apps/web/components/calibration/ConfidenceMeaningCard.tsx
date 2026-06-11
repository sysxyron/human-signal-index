// =============================================================================
// HSI Phase 16 — ConfidenceMeaningCard. The prominent "What does X% confidence
// actually MEAN?" explainer. Grounds a stated confidence in its empirically
// observed historical success rate using the latest reliability curve, e.g.
// "82% confidence predictions have historically succeeded 80.9% of the time
// across 22 observations." Never a certainty — when there is no history for the
// band, it says so honestly. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { Sparkles } from 'lucide-react';
import { formatRate, toneColor } from '@/lib/calibration/view';

export function ConfidenceMeaningCard({
  statedConfidence,
  historicalSuccess,
  sampleCount,
  sentence,
}: {
  statedConfidence: number;
  historicalSuccess: number;
  sampleCount: number;
  sentence: string;
}) {
  const grounded = sampleCount > 0;
  const gap = Math.abs(statedConfidence - historicalSuccess);
  const gapColor = gap <= 0.05 ? toneColor('green') : gap <= 0.15 ? toneColor('orange') : toneColor('red');

  return (
    <Card className="relative space-y-3 overflow-hidden border-electric/30 bg-electric/[0.04]" padded>
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-electric/10 blur-3xl" />
      <h3 className="relative flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Sparkles className="h-4 w-4 text-electric" /> What does{' '}
        {formatRate(statedConfidence, 0)} confidence mean?
      </h3>

      <div className="relative flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-3xl font-bold tracking-tight text-electric">
          {formatRate(statedConfidence, 0)}
        </span>
        <span className="mb-1 text-text-muted">stated →</span>
        <span className="text-3xl font-bold tracking-tight text-text-primary">
          {grounded ? formatRate(historicalSuccess, 1) : '—'}
        </span>
        <span className="mb-1 text-text-muted">observed</span>
        {grounded ? (
          <span
            className="mb-1 ml-auto rounded-full px-2 py-0.5 text-caption font-semibold"
            style={{ backgroundColor: `${gapColor}1f`, color: gapColor }}
          >
            {formatRate(gap, 1)} gap
          </span>
        ) : null}
      </div>

      <p className="relative text-body-sm leading-relaxed text-text-secondary">{sentence}</p>

      <p className="relative text-caption text-text-muted">
        {grounded
          ? `Grounded in ${sampleCount} observed outcomes — a historical pattern, not a guarantee for any single future prediction.`
          : 'No historical observations for this confidence band yet — the meaning cannot be grounded honestly.'}
      </p>
    </Card>
  );
}
