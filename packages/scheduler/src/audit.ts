/**
 * @hsi/scheduler — audit sink and event builders.
 *
 * An in-memory sink with an optional injected `emit` so the app can also
 * persist events to its `audit_logs` table. All builders are pure.
 */

import type { AuditEvent, AuditEventType } from './types';

/** A sink that records audit events. */
export interface AuditSink {
  record(event: AuditEvent): void;
  events(): AuditEvent[];
}

/**
 * Create an in-memory audit sink. If `emit` is provided it is invoked for each
 * recorded event (e.g. to forward to a persistent store). The in-memory buffer
 * is always populated regardless.
 */
export function createAuditSink(emit?: (event: AuditEvent) => void): AuditSink {
  const buffer: AuditEvent[] = [];
  return {
    record(event: AuditEvent): void {
      buffer.push(event);
      if (emit) emit(event);
    },
    events(): AuditEvent[] {
      return buffer.slice();
    },
  };
}

interface BuildOpts {
  jobId?: string;
  ruleId?: string;
  meta?: Record<string, unknown>;
}

function build(
  type: AuditEventType,
  at: string,
  message: string,
  opts: BuildOpts = {},
): AuditEvent {
  const event: AuditEvent = { at, type, message };
  if (opts.jobId !== undefined) event.jobId = opts.jobId;
  if (opts.ruleId !== undefined) event.ruleId = opts.ruleId;
  if (opts.meta !== undefined) event.meta = opts.meta;
  return event;
}

export function jobCreated(
  at: string,
  jobId: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('job_created', at, `job ${jobId} created`, { jobId, meta });
}

export function jobClaimed(
  at: string,
  jobId: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('job_claimed', at, `job ${jobId} claimed`, { jobId, meta });
}

export function jobCompleted(
  at: string,
  jobId: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('job_completed', at, `job ${jobId} completed`, { jobId, meta });
}

export function jobFailed(
  at: string,
  jobId: string,
  error: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('job_failed', at, `job ${jobId} failed: ${error}`, {
    jobId,
    meta: { error, ...meta },
  });
}

export function retryScheduled(
  at: string,
  jobId: string,
  nextRunAt: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('retry_scheduled', at, `job ${jobId} retry at ${nextRunAt}`, {
    jobId,
    meta: { nextRunAt, ...meta },
  });
}

export function jobCancelled(
  at: string,
  jobId: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('job_cancelled', at, `job ${jobId} cancelled`, { jobId, meta });
}

export function ruleFired(
  at: string,
  ruleId: string,
  jobId?: string,
  meta?: Record<string, unknown>,
): AuditEvent {
  return build('rule_fired', at, `rule ${ruleId} fired`, { ruleId, jobId, meta });
}
