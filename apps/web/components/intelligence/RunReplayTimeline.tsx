// =============================================================================
// HSI Phase 18 — RunReplayTimeline. A vertical, audited timeline of a research
// run's full intelligence process: every state transition (from→to, actor,
// reason) in order. Nothing hidden — this is the replayable history. Pure
// presentational, server-safe.
// =============================================================================

import type { HsinResearchRunEventRecord } from '@hsi/shared-types';
import { formatDateTime, runStateDecor } from '@/lib/orchestration/view';

export function RunReplayTimeline({ events }: { events: HsinResearchRunEventRecord[] }) {
  if (events.length === 0) {
    return <p className="text-caption text-text-muted">No events recorded for this run.</p>;
  }
  return (
    <ol className="relative ml-3 space-y-4 border-l border-border pl-5">
      {events.map((e) => {
        const decor = runStateDecor(e.to_state);
        return (
          <li key={e.id} className="relative">
            <span
              className="absolute -left-[27px] top-0.5 h-3 w-3 rounded-full border-2 border-surface"
              style={{ backgroundColor: decor.color }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-caption text-text-muted">{e.from_state}</span>
              <span className="text-text-muted">→</span>
              <span className="text-caption font-semibold" style={{ color: decor.color }}>
                {e.to_state}
              </span>
              <span className="text-[11px] text-text-muted">· {formatDateTime(e.at ?? e.created_at)}</span>
            </div>
            {e.reason ? <p className="mt-0.5 text-[12px] leading-snug text-text-secondary">{e.reason}</p> : null}
            <p className="mt-0.5 text-[11px] text-text-muted">by {e.actor ?? 'orchestrator'}</p>
          </li>
        );
      })}
    </ol>
  );
}
