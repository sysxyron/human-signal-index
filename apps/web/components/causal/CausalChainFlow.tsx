// =============================================================================
// HSI Phase 11 — CausalChainFlow. Server-safe, renders an ordered causal CHAIN as
// a vertical event cascade (source_expansion ↓ signal_surge ↓ community_growth ↓
// amplification_spike ↓ …) with the chain name, summary and confidence. Each step
// shows its event-type badge + data-grounded explanation. Deterministic, no
// client JS needed — the cascade is the "why it moved" story.
// =============================================================================

import { Card } from '@hsi/ui';
import { GitBranch, ChevronDown } from 'lucide-react';
import type { CausalView } from '@hsi/shared-types';
import { CausalEventBadge } from './CausalEventBadge';
import {
  confidenceBand,
  eventDecor,
  formatConfidence,
  formatDate,
} from '@/lib/causal/view';

type ChainWithEvents = CausalView['chains'][number];

export function CausalChainFlow({
  chain,
  narrativeName,
}: {
  chain: ChainWithEvents;
  narrativeName?: string;
}) {
  const band = confidenceBand(chain.confidence);
  return (
    <Card className="space-y-3" padded>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
            <GitBranch className="h-4 w-4 text-electric" />
            {chain.chain_name ?? 'Causal chain'}
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
          title="Confidence in this causal chain"
        >
          {formatConfidence(chain.confidence)} · {band.label}
        </span>
      </div>

      {chain.summary ? (
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {chain.summary}
        </p>
      ) : null}

      {chain.events.length === 0 ? (
        <p className="text-caption text-text-muted">No member events recorded.</p>
      ) : (
        <ol className="space-y-0">
          {chain.events.map((e, i) => {
            const decor = eventDecor(e.event_type);
            const isLast = i === chain.events.length - 1;
            return (
              <li key={e.id} className="relative">
                <div
                  className="flex gap-3 rounded-card border border-border bg-surface-2/40 p-3"
                  style={{ borderLeft: `3px solid ${decor.color}` }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-caption font-bold text-text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CausalEventBadge type={e.event_type} />
                      <span className="ml-auto font-mono text-caption text-text-muted">
                        {formatDate(e.occurred_at ?? e.created_at)}
                      </span>
                    </div>
                    {e.explanation ? (
                      <p className="text-caption leading-relaxed text-text-secondary">
                        {e.explanation}
                      </p>
                    ) : null}
                  </div>
                </div>
                {!isLast ? (
                  <div className="flex justify-center py-1">
                    <ChevronDown className="h-4 w-4 text-text-muted" />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
