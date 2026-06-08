// =============================================================================
// HSI Phase 9 — DeadLetterTable. Jobs that exhausted their retry budget and were
// parked off the live queue. Shows job_type, source, attempts/max, reason,
// last_error, dead_lettered_at + a per-row Requeue control. Never hides a job.
// Server-safe (the Requeue control is a nested client component).
// =============================================================================

import { Card } from '@hsi/ui';
import { Skull } from 'lucide-react';
import type { HsinDeadLetterJobRecord } from '@hsi/shared-types';
import { formatDateTime, relativeTime, titleize } from '@/lib/operations/phase9-view';
import { ProviderReasonBadge } from './ProviderReasonBadge';
import { RequeueButton } from './RequeueButton';

export function DeadLetterTable({
  jobs,
  canRequeue,
  demo = false,
}: {
  jobs: HsinDeadLetterJobRecord[];
  canRequeue: boolean;
  demo?: boolean;
}) {
  return (
    <Card className="space-y-4" padded>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <Skull className="h-4 w-4 text-risk" /> Dead-lettered jobs
        </h3>
        <span className="text-caption text-text-muted">{jobs.length} job{jobs.length === 1 ? '' : 's'}</span>
      </div>
      {jobs.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No dead-lettered jobs. Jobs land here only after they exhaust every retry — an
          empty queue is the healthy state.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-caption">
            <thead>
              <tr className="border-b border-border text-left text-label text-text-muted">
                <th className="px-2 py-2 font-medium">Job type</th>
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 text-right font-medium">Attempts</th>
                <th className="px-2 py-2 font-medium">Reason</th>
                <th className="px-2 py-2 font-medium">Last error</th>
                <th className="px-2 py-2 font-medium">Dead-lettered</th>
                <th className="px-2 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-border/50 align-top last:border-0">
                  <td className="px-2 py-2 font-semibold text-text-primary">
                    {j.job_type ? titleize(j.job_type) : '—'}
                  </td>
                  <td className="px-2 py-2 font-mono text-text-muted" title={j.source_id}>
                    {j.source_id ? `${j.source_id.slice(0, 14)}…` : '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-text-secondary">
                    {j.attempt_count ?? '—'}
                    {j.max_attempts != null ? ` / ${j.max_attempts}` : ''}
                  </td>
                  <td className="px-2 py-2">
                    <ProviderReasonBadge reason={j.reason} />
                  </td>
                  <td className="px-2 py-2 text-text-secondary">
                    <span className="block max-w-xs">{j.last_error ?? '—'}</span>
                  </td>
                  <td className="px-2 py-2 text-text-muted" title={formatDateTime(j.dead_lettered_at)}>
                    {relativeTime(j.dead_lettered_at)}
                  </td>
                  <td className="px-2 py-2">
                    {j.requeued_at ? (
                      <span className="text-caption text-text-muted">
                        Requeued {relativeTime(j.requeued_at)}
                      </span>
                    ) : (
                      <RequeueButton jobId={j.id} canRequeue={canRequeue} demo={demo} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
