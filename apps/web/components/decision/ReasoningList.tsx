// =============================================================================
// HSI Phase 13 — ReasoningList. Renders a decision's grounded reasoning trail as
// an ordered list. Server-safe. Reasoning is the "why" behind the recommendation
// — shown plainly, never hidden, never as a claim of certainty.
// =============================================================================

import { ListChecks } from 'lucide-react';

export function ReasoningList({
  reasoning,
  title = 'Reasoning',
  emptyHint = 'No reasoning recorded for this decision.',
}: {
  reasoning: string[];
  title?: string;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <ListChecks className="h-4 w-4 text-electric" /> {title}
      </h4>
      {reasoning.length === 0 ? (
        <p className="text-caption text-text-muted">{emptyHint}</p>
      ) : (
        <ol className="space-y-2">
          {reasoning.map((r, i) => (
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
