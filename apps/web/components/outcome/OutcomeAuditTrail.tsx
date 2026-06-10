// =============================================================================
// HSI Phase 15 — OutcomeAuditTrail. Renders the FULL traceable chain behind an
// outcome so a HUMAN can see EXACTLY how the verdict was reached:
//   Recommendation → Expected → Observed → Success Score → Confidence Update →
//   Governance Review.
// Each step carries a data-grounded detail string and (where present) a timestamp.
// NO black-box — the whole chain is shown in order. Server-safe / presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { ScrollText } from 'lucide-react';
import { formatDateTime } from '@/lib/outcome/view';

interface AuditStep {
  step: string;
  detail: string;
  at?: string;
}

export function OutcomeAuditTrail({
  steps,
  title = 'Outcome audit trail',
}: {
  steps: AuditStep[];
  title?: string;
}) {
  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ScrollText className="h-4 w-4 text-electric" /> {title}
      </h3>
      <p className="text-caption text-text-muted">
        The full traceable chain from the original recommendation to the governance
        verdict — every step is logged with a data-grounded detail. No black box.
      </p>

      {steps.length === 0 ? (
        <p className="text-caption text-text-muted">No audit steps recorded.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={`${s.step}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-electric/15 text-[11px] font-semibold text-electric">
                  {i + 1}
                </span>
                {i < steps.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-border" aria-hidden />
                ) : null}
              </div>
              <div className="space-y-0.5 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold text-text-primary">
                    {s.step}
                  </span>
                  {s.at ? (
                    <span className="text-caption text-text-muted">
                      {formatDateTime(s.at)}
                    </span>
                  ) : null}
                </div>
                <p className="text-caption leading-relaxed text-text-secondary">
                  {s.detail || '—'}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
