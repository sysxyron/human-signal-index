// =============================================================================
// @hsi/security — audit event shape.
// Defensive observability: who did what, when, on which entity. Timestamps are
// PASSED IN (no Date.now() inside) so events are deterministic/testable. The
// sink is injected (DB writer, log, etc.).
// =============================================================================

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'source.create'
  | 'source.update'
  | 'signal.capture'
  | 'signal.classify'
  | 'signal.traceability_check'
  | 'review.decision'
  | 'report.publish'
  | 'report.block'
  | 'upload.create'
  | 'rate_limit.block'
  | 'security.event';

export interface AuditEvent {
  /** ISO timestamp — PASSED IN by the caller. */
  at: string;
  action: AuditAction | string;
  /** Actor (user id) or 'system' for automated jobs. */
  actor: string;
  /** Affected entity, e.g. { type: 'signal', id: '...' }. */
  target?: { type: string; id: string };
  /** Structured, non-sensitive metadata for the audit trail. */
  metadata?: Record<string, unknown>;
  /** Outcome of the action. */
  outcome: 'success' | 'failure' | 'blocked';
}

/** Sink that persists an audit event (DB insert, log line, etc.). */
export type AuditSink = (event: AuditEvent) => void | Promise<void>;

/**
 * Construct + emit an audit event. Returns the event so callers can also store
 * it. `at` must be supplied by the caller.
 */
export async function auditEvent(
  event: AuditEvent,
  sink?: AuditSink,
): Promise<AuditEvent> {
  if (sink) await sink(event);
  return event;
}
