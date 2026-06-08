'use client';

// =============================================================================
// HSI Phase 8 — JobsTable. The durable job queue with status/jobType filters
// and per-job Retry/Cancel (curator+). Clicking a job opens a detail drawer that
// loads its full attempt history via getJobAction. Failed jobs are never hidden.
// =============================================================================

import { useMemo, useState, useTransition, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Select } from '@hsi/ui';
import { ListChecks, RotateCw, Ban, X, Loader2 } from 'lucide-react';
import type {
  HsinJobQueueRecord,
  JobStatus,
  JobWithAttempts,
} from '@hsi/shared-types';
import {
  getJobAction,
  retryJobAction,
  cancelJobAction,
} from '@/lib/operations/actions';
import { formatDateTime, relativeTime } from '@/lib/operations/view';
import { JobStatusBadge } from './JobStatusBadge';
import { JobAttemptsList } from './JobAttemptsList';
import { ErrorState } from '@/components/signals/states';

const STATUSES: JobStatus[] = [
  'queued',
  'running',
  'completed',
  'failed',
  'retrying',
  'cancelled',
];

export function JobsTable({
  jobs,
  jobTypes,
  canManage,
  demo = false,
  initialStatus = '',
  initialJobType = '',
}: {
  jobs: HsinJobQueueRecord[];
  jobTypes: string[];
  canManage: boolean;
  demo?: boolean;
  initialStatus?: string;
  initialJobType?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [jobType, setJobType] = useState(initialJobType);
  const [selected, setSelected] = useState<string | null>(null);

  // For live data the server already filtered via querystring; for demo we filter
  // client-side. Either way, filtering the in-hand rows keeps the UI responsive.
  const filtered = useMemo(
    () =>
      jobs.filter((j) => {
        if (status && j.status !== status) return false;
        if (jobType && j.job_type !== jobType) return false;
        return true;
      }),
    [jobs, status, jobType],
  );

  const applyServerFilters = useCallback(
    (nextStatus: string, nextJobType: string) => {
      if (demo) return; // demo filters client-side only
      const params = new URLSearchParams();
      if (nextStatus) params.set('status', nextStatus);
      if (nextJobType) params.set('jobType', nextJobType);
      const qs = params.toString();
      router.push(`/dashboard/operations${qs ? `?${qs}` : ''}` as never);
    },
    [demo, router],
  );

  return (
    <Card className="space-y-4" padded>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
          <ListChecks className="h-4 w-4 text-electric" /> Job queue
        </h3>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              applyServerFilters(e.target.value, jobType);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by job type"
            value={jobType}
            onChange={(e) => {
              setJobType(e.target.value);
              applyServerFilters(status, e.target.value);
            }}
          >
            <option value="">All job types</option>
            {jobTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-body-sm text-text-secondary">No jobs match the current filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-caption">
            <thead className="text-label text-text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Job type</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium">Scheduled</th>
                <th className="py-2 pr-3 font-medium">Updated</th>
                <th className="py-2 pr-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <JobRow
                  key={j.id}
                  job={j}
                  canManage={canManage}
                  demo={demo}
                  onOpen={() => setSelected(j.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <JobDrawer
          jobId={selected}
          demoJob={demo ? jobs.find((j) => j.id === selected) : undefined}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </Card>
  );
}

function JobRow({
  job,
  canManage,
  demo,
  onOpen,
}: {
  job: HsinJobQueueRecord;
  canManage: boolean;
  demo: boolean;
  onOpen: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canRetry = job.status === 'failed' || job.status === 'cancelled';
  const canCancel = job.status === 'queued' || job.status === 'running' || job.status === 'retrying';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    if (demo || !canManage) return;
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Action failed.');
    });
  };

  return (
    <>
      <tr className="border-b border-border/60 align-top">
        <td className="py-2 pr-3">
          <button
            type="button"
            onClick={onOpen}
            className="font-mono text-text-primary underline-offset-2 hover:text-electric hover:underline"
          >
            {job.job_type}
          </button>
          {job.source_id ? (
            <span className="ml-1 font-mono text-text-muted">
              · {job.source_id.slice(0, 8)}
            </span>
          ) : null}
        </td>
        <td className="py-2 pr-3">
          <JobStatusBadge status={job.status} />
        </td>
        <td className="py-2 pr-3 font-mono text-text-secondary">
          {job.attempt_count}/{job.max_attempts}
        </td>
        <td className="py-2 pr-3 text-text-secondary">{formatDateTime(job.scheduled_for)}</td>
        <td className="py-2 pr-3 text-text-secondary">{relativeTime(job.updated_at)}</td>
        <td className="py-2 pr-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(() => retryJobAction(job.id))}
              disabled={pending || demo || !canManage || !canRetry}
              title={!canManage ? 'Curator role required' : 'Retry job'}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => run(() => cancelJobAction(job.id))}
              disabled={pending || demo || !canManage || !canCancel}
              title={!canManage ? 'Curator role required' : 'Cancel job'}
            >
              <Ban className="h-3.5 w-3.5" /> Cancel
            </Button>
          </div>
        </td>
      </tr>
      {job.error_message ? (
        <tr>
          <td colSpan={6} className="pb-2">
            <p className="text-caption text-risk">Last error: {job.error_message}</p>
          </td>
        </tr>
      ) : null}
      {error ? (
        <tr>
          <td colSpan={6} className="pb-2">
            <ErrorState title="Job action failed" message={error} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function JobDrawer({
  jobId,
  demoJob,
  onClose,
}: {
  jobId: string;
  demoJob?: HsinJobQueueRecord;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<JobWithAttempts | null>(
    demoJob ? { job: demoJob, attempts: [] } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(!demoJob);

  // Load the full job detail on mount (demo synthesizes from the in-hand row).
  useEffect(() => {
    if (demoJob) return;
    let active = true;
    setPending(true);
    getJobAction(jobId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setDetail(res.data);
        else setError(res.error);
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [jobId, demoJob]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-surface shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-h6 font-semibold text-text-primary">Job detail</p>
            <p className="font-mono text-caption text-text-muted">{jobId}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-2 hover:text-white"
            aria-label="Close job detail"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {pending && !detail ? (
            <p className="flex items-center gap-2 text-caption text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading job…
            </p>
          ) : error ? (
            <ErrorState title="Could not load job" message={error} />
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <JobStatusBadge status={detail.job.status} />
                <span className="font-mono text-caption text-text-secondary">
                  {detail.job.job_type}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-caption">
                <Field label="Priority" value={String(detail.job.priority)} />
                <Field
                  label="Attempts"
                  value={`${detail.job.attempt_count}/${detail.job.max_attempts}`}
                />
                <Field label="Scheduled" value={formatDateTime(detail.job.scheduled_for)} />
                <Field label="Started" value={formatDateTime(detail.job.started_at)} />
                <Field label="Finished" value={formatDateTime(detail.job.finished_at)} />
                <Field
                  label="Source"
                  value={detail.job.source_id ? detail.job.source_id.slice(0, 12) : '—'}
                />
              </dl>
              {detail.job.error_message ? (
                <p className="rounded-card border border-risk/40 bg-risk/5 p-3 text-caption text-risk">
                  {detail.job.error_message}
                </p>
              ) : null}
              <JobAttemptsList attempts={detail.attempts} title="Attempt history" />
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono text-text-primary">{value}</dd>
    </div>
  );
}
