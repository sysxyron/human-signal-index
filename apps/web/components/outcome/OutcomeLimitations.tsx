// =============================================================================
// HSI Phase 15 — OutcomeLimitations + OutcomeExplanation. Render an outcome's
// explicit LIMITATIONS prominently (never hidden, never collapsed) and its
// data-grounded EXPLANATION as an ordered list. Outcome verdicts are AIDS for a
// human reviewer, not certainties; these are the honesty surfaces that say so.
// Limitations always render (even empty → the default caveat). Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { AlertTriangle, ShieldAlert, ListChecks } from 'lucide-react';

const DEFAULT_CAVEAT =
  'This outcome verdict is derived from the OBSERVED data measured against the ' +
  'recommendation\'s prediction — it carries a success score and a confidence, but ' +
  'it is not a certainty. Treat it as input for human judgement and governance ' +
  'review, never as the final word.';

export function OutcomeLimitations({
  limitations,
  title = 'Limitations',
}: {
  limitations: string[];
  title?: string;
}) {
  const items = limitations.length > 0 ? limitations : [DEFAULT_CAVEAT];
  return (
    <Card className="space-y-3 border-warning/40 bg-warning/5" padded>
      <div className="flex items-center gap-2">
        <h4 className="flex items-center gap-2 text-h6 font-semibold text-warning">
          <ShieldAlert className="h-4 w-4" /> {title}
        </h4>
        <span className="ml-auto text-caption font-semibold text-warning">
          outcome verdict — not a certainty
        </span>
      </div>
      <ul className="space-y-2">
        {items.map((l, i) => (
          <li
            key={i}
            className="flex gap-2.5 text-caption leading-relaxed text-text-secondary"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OutcomeExplanation({
  explanation,
  title = 'Explanation',
  emptyHint = 'No explanation was recorded for this outcome.',
}: {
  explanation: string[];
  title?: string;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ListChecks className="h-4 w-4 text-electric" /> {title}
      </h4>
      {explanation.length === 0 ? (
        <p className="text-caption text-text-muted">{emptyHint}</p>
      ) : (
        <ol className="space-y-2">
          {explanation.map((r, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-caption leading-relaxed text-text-secondary"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-electric/15 text-[11px] font-semibold text-electric">
                {i + 1}
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
