// =============================================================================
// HSI Phase 8 — JobAttemptsList. Renders a job's per-attempt history (or the
// operations overview's recent attempts). Failed attempts ALWAYS show their
// error message — failures are never hidden. Server-safe.
// =============================================================================

import { Card } from '@hsi/ui';
import { History } from 'lucide-react';
import type { HsinJobAttemptRecord } from '@hsi/shared-types';
import { AttemptStatusBadge } from './JobStatusBadge';
import { formatDateTime, formatDuration } from '@/lib/operations/view';

export function JobAttemptsList({
  attempts,
  title = 'Recent job attempts',
  showJobId = false,
}: {
  attempts: HsinJobAttemptRecord[];
  title?: string;
  showJobId?: boolean;
}) {
  return (
    <Card className="space-y-3" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <History className="h-4 w-4 text-electric" /> {title}
      </h3>
      {attempts.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No attempts recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">#</th>
                {showJobId ? <th className="py-2 pr-3 font-medium">Job</th> : null}
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Started</th>
                <th className="py-2 pr-3 font-medium">Duration</th>
                <th className="py-2 pr-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 font-mono text-text-secondary">
                    {a.attempt_number}
                  </td>
                  {showJobId ? (
                    <td className="py-2 pr-3 font-mono text-text-muted">
                      {a.job_id.slice(0, 8)}
                    </td>
                  ) : null}
                  <td className="py-2 pr-3">
                    <AttemptStatusBadge status={a.status} />
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {formatDateTime(a.started_at)}
                  </td>
                  <td className="py-2 pr-3 text-text-secondary">
                    {formatDuration(a.started_at, a.finished_at)}
                  </td>
                  <td className="py-2 pr-3 text-risk">
                    {a.error_message ? (
                      <span className="block max-w-md break-words">{a.error_message}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
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
