// =============================================================================
// HSI Phase 11 — EventList. Server-safe ranked list of causal events: event-type
// badge, data-grounded explanation, strength × confidence, and the date. Used for
// "most influential events", "growth causes", "decline causes". NEVER fabricates —
// renders only the explanation/metrics provided on each record.
// =============================================================================

import { Card } from '@hsi/ui';
import type { HsinCausalEventRecord } from '@hsi/shared-types';
import { CausalEventBadge } from './CausalEventBadge';
import {
  formatConfidence,
  formatDate,
  formatStrength,
  eventScore,
} from '@/lib/causal/view';

export function EventList({
  events,
  narrativeNames,
  emptyHint = 'No causal events detected.',
  showNarrative = false,
  limit,
}: {
  events: HsinCausalEventRecord[];
  narrativeNames?: Map<string, string>;
  emptyHint?: string;
  showNarrative?: boolean;
  limit?: number;
}) {
  const rows = typeof limit === 'number' ? events.slice(0, limit) : events;
  if (rows.length === 0) {
    return <p className="text-caption text-text-muted">{emptyHint}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((e) => {
        const score = Math.round(eventScore(e));
        return (
          <li key={e.id}>
            <Card className="space-y-1.5 border-border bg-surface-2/40" padded>
              <div className="flex flex-wrap items-center gap-2">
                <CausalEventBadge type={e.event_type} />
                {showNarrative ? (
                  <span className="text-caption font-semibold text-text-secondary">
                    {narrativeNames?.get(e.narrative_id) ?? e.narrative_id}
                  </span>
                ) : null}
                <span className="ml-auto font-mono text-caption text-text-muted">
                  {formatDate(e.occurred_at ?? e.created_at)}
                </span>
              </div>
              {e.explanation ? (
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  {e.explanation}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 text-caption text-text-muted">
                <span>
                  Strength{' '}
                  <span className="font-mono font-semibold text-text-primary">
                    {formatStrength(e.event_strength)}
                  </span>
                  /100
                </span>
                <span>
                  Confidence{' '}
                  <span className="font-mono font-semibold text-text-primary">
                    {formatConfidence(e.confidence)}
                  </span>
                </span>
                <span className="ml-auto">
                  score{' '}
                  <span className="font-mono font-semibold text-electric">{score}</span>
                </span>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
