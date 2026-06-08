// =============================================================================
// HSI Phase 11 — ChangeExplanation. Server-safe panel rendering a DATA-GROUNDED
// causal explanation for a narrative: a headline, the explanatory paragraph,
// confidence band, and factor chips (each with its grounding metric). NEVER
// fabricates — renders only the factors / metrics provided on the payload, and
// is explicit that this is a descriptive aid for a human reviewer.
// =============================================================================

import { Card } from '@hsi/ui';
import { Lightbulb, Info } from 'lucide-react';
import type { CausalExplanation } from '@hsi/shared-types';
import { confidenceBand, formatConfidence } from '@/lib/causal/view';

export function ChangeExplanation({
  explanation,
  narrativeName,
}: {
  explanation: CausalExplanation;
  narrativeName?: string;
}) {
  const band = confidenceBand(explanation.confidence);
  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <Lightbulb className="h-4 w-4 text-electric" />
            {explanation.headline || 'Why this narrative moved'}
          </h3>
          {narrativeName ? (
            <p className="text-caption text-text-muted">{narrativeName}</p>
          ) : null}
        </div>
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold"
          style={{
            backgroundColor: `${band.color}1f`,
            color: band.color,
            border: `1px solid ${band.color}55`,
          }}
          title="Confidence in this explanation"
        >
          {formatConfidence(explanation.confidence)} · {band.label}
        </span>
      </div>

      {explanation.text ? (
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {explanation.text}
        </p>
      ) : (
        <p className="text-body-sm text-text-muted">
          No explanatory text available for this narrative yet.
        </p>
      )}

      {explanation.factors.length > 0 ? (
        <div className="space-y-2">
          <p className="text-label text-text-muted">Supporting factors</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {explanation.factors.map((f, i) => (
              <div
                key={`${f.label}-${i}`}
                className="rounded-card border border-border bg-surface-2/40 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-caption font-semibold text-text-primary">
                    {f.label}
                  </span>
                  {typeof f.metric === 'number' ? (
                    <span className="font-mono text-caption font-semibold text-electric">
                      {Math.round(f.metric * 100) / 100}
                    </span>
                  ) : null}
                </div>
                {f.detail ? (
                  <p className="mt-0.5 text-caption leading-relaxed text-text-secondary">
                    {f.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-caption text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Generated from the narrative&apos;s own snapshot history — a descriptive aid
        for human review, never an auto-published claim or a judgement of truth.
      </p>
    </Card>
  );
}
