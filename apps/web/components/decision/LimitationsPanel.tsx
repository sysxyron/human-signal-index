// =============================================================================
// HSI Phase 13 — LimitationsPanel. Renders a decision's explicit LIMITATIONS
// prominently — NEVER hidden, NEVER collapsed. Decision-intelligence outputs are
// AIDS for a human reviewer, not commands or certainties; this panel is the
// honesty surface that says so. Always rendered (even when empty it states the
// default caveat) so a reader can never mistake an aid for a verdict.
// =============================================================================

import { Card } from '@hsi/ui';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

const DEFAULT_CAVEAT =
  'This is a grounded decision AID derived from the narrative\'s real signal, ' +
  'causal, and counterfactual history — not a command and not a certainty. It ' +
  'carries a confidence and a reasoning trail; treat it as input for human ' +
  'judgement, never as the final decision.';

export function LimitationsPanel({
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
          decision aid — not a certainty
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
