// =============================================================================
// HSI Phase 8 — OverduePanel + SlaPolicyList.
//
// SLA / escalation surfacing for the operations console. A dedicated DAL for
// "overdue review items" is not part of the Phase-8 action contract, so this
// panel honestly does two things:
//   1. SlaPolicyList — renders the configured SLA policies (severity, review +
//      escalation deadlines) so operators know the deadlines in force; and
//   2. OverduePanel — surfaces the jobs that NEED ATTENTION (failed / retrying),
//      which ARE available, plus a clearly-labeled placeholder noting that an
//      "overdue review queue" feed will populate here when wired.
//
// Never hides failed/overdue work. Server-safe, purely presentational.
// =============================================================================

import { Card } from '@hsi/ui';
import { AlertTriangle, ShieldAlert, Clock } from 'lucide-react';
import type {
  HsinJobQueueRecord,
  HsinSlaPolicyRecord,
} from '@hsi/shared-types';
import { JobStatusBadge } from './JobStatusBadge';
import { SlaBadge } from './SlaBadge';
import { slaSeverityDecor, formatDateTime, relativeTime } from '@/lib/operations/view';

/** List the configured SLA policies with their review/escalation deadlines. */
export function SlaPolicyList({
  policies,
}: {
  policies: HsinSlaPolicyRecord[];
}) {
  return (
    <Card className="space-y-4" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
        <Clock className="h-4 w-4 text-electric" /> SLA policies
      </h3>
      {policies.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No SLA policies configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Policy</th>
                <th className="py-2 pr-3 font-medium">Severity</th>
                <th className="py-2 pr-3 font-medium">Review by</th>
                <th className="py-2 pr-3 font-medium">Escalate by</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => {
                const sev = slaSeverityDecor(p.severity);
                return (
                  <tr key={p.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-semibold text-text-primary">{p.name}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${sev.color}1f`,
                          color: sev.color,
                          border: `1px solid ${sev.color}55`,
                        }}
                      >
                        {sev.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {p.review_deadline_hours != null ? `${p.review_deadline_hours}h` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {p.escalation_deadline_hours != null
                        ? `${p.escalation_deadline_hours}h`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Surface work that needs attention: failed + retrying jobs (real), plus a
 * documented placeholder for the overdue-review queue. Failed/overdue are never
 * hidden.
 */
export function OverduePanel({
  attentionJobs,
}: {
  attentionJobs: HsinJobQueueRecord[];
}) {
  return (
    <Card className="space-y-4 border-warning/30" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-warning">
        <ShieldAlert className="h-4 w-4" /> Needs attention
      </h3>

      {attentionJobs.length === 0 ? (
        <p className="text-body-sm text-text-secondary">
          No failed or retrying jobs. Nothing requires attention right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {attentionJobs.map((j) => (
            <li
              key={j.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-surface-2/40 p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <JobStatusBadge status={j.status} />
                  <span className="font-mono text-caption text-text-secondary">
                    {j.job_type}
                  </span>
                  <span className="text-caption text-text-muted">
                    attempt {j.attempt_count}/{j.max_attempts}
                  </span>
                </div>
                {j.error_message ? (
                  <p className="flex items-start gap-1.5 text-caption text-risk">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-words">{j.error_message}</span>
                  </p>
                ) : null}
              </div>
              <span className="text-caption text-text-muted">
                {relativeTime(j.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Documented placeholder: an overdue-review-queue feed is not part of the
          Phase-8 action contract yet; SLA badges below illustrate the states. */}
      <div className="space-y-2 rounded-card border border-dashed border-border bg-surface-2/30 p-3">
        <p className="text-caption text-text-muted">
          Overdue review items will appear here once a review-deadline feed is
          wired into the operations contract. The SLA states surfaced across the
          app use these badges:
        </p>
        <div className="flex flex-wrap gap-2">
          <SlaBadge state="on_track" />
          <SlaBadge state="due_soon" />
          <SlaBadge state="overdue_review" />
          <SlaBadge state="overdue_escalation" />
        </div>
        <p className="text-caption text-text-muted">
          Deadlines derive from the configured SLA policies (e.g.{' '}
          {formatDateTime(new Date().toISOString())} + the policy window).
        </p>
      </div>
    </Card>
  );
}
