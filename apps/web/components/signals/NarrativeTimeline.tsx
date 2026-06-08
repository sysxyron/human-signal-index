// =============================================================================
// HSI Phase 7 — NarrativeTimeline. Renders detected narrative-drift events for a
// source/signal as a timeline: before → after framing, explanation, drift score
// and confidence (uncertainty preserved, never hidden). Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { GitCompareArrows, TrendingUp } from 'lucide-react';
import type { HsinNarrativeDriftRecord } from '@hsi/shared-types';
import { confidencePct, formatDateTime, excerpt } from '@/lib/signals/view';

export function NarrativeTimeline({
  events,
}: {
  events: HsinNarrativeDriftRecord[];
}) {
  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <GitCompareArrows className="h-4 w-4 text-electric" /> Narrative timeline
      </h3>
      {events.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No narrative-drift events detected for this source yet.
        </p>
      ) : (
        <ol className="relative space-y-5 border-l border-border pl-5">
          {events.map((e) => {
            const drift = e.drift_score != null ? Math.round(e.drift_score * 100) : null;
            return (
              <li key={e.id} className="relative">
                <span
                  className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-accent ring-4 ring-surface"
                  aria-hidden
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption text-text-muted">
                    {formatDateTime(e.detected_at ?? e.created_at)}
                  </span>
                  {drift != null ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-caption font-semibold text-accent">
                      <TrendingUp className="h-3 w-3" /> drift {drift}%
                    </span>
                  ) : null}
                  <span className="text-caption text-text-muted">
                    confidence {confidencePct(e.confidence)}
                  </span>
                </div>
                {e.explanation ? (
                  <p className="mt-1 text-body-sm text-text-primary">{e.explanation}</p>
                ) : null}
                {e.before_text || e.after_text ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-btn border border-border bg-surface-2/40 p-2.5">
                      <p className="text-label text-text-muted">Before</p>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        {excerpt(e.before_text, 200) || '—'}
                      </p>
                    </div>
                    <div className="rounded-btn border border-accent/30 bg-accent/5 p-2.5">
                      <p className="text-label text-text-muted">After</p>
                      <p className="mt-0.5 text-caption text-text-secondary">
                        {excerpt(e.after_text, 200) || '—'}
                      </p>
                    </div>
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
