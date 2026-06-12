// =============================================================================
// @hsi/intelligence-queue — public type surface (WorldForge/HSI Phase 18).
//
// A PRIORITY RESEARCH QUEUE for the Intelligence Operations Center. The engine is
// PURE: every operation takes a queue SNAPSHOT and returns a NEW snapshot (the
// caller persists it, so the queue "survives restarts" by being stored, never by
// holding in-memory state). Ordering is deterministic; `now` is injected.
//
// PRINCIPLES (binding — identical to Phases 16-17):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every state change is reflected in the item and
//     reproducible from the inputs. NEVER drops work silently.
// =============================================================================

/** Queue priority (CRITICAL first). */
export type QueuePriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

/** Lifecycle status of a queued research item. */
export type QueueItemStatus =
  | 'queued'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'retrying';

/** A single queued research item. */
export interface QueueItem {
  id: string;
  /** The research run this item drives (1:1). */
  runId: string;
  priority: QueuePriority;
  status: QueueItemStatus;
  /** Attempts made so far (0 until first dequeue). */
  attempts: number;
  /** Max attempts before a failure is terminal (default 3). */
  maxAttempts: number;
  enqueuedAt: string;
  /** Not eligible for dequeue before this time (backoff). Defaults to enqueuedAt. */
  availableAt: string;
  /** Last time the item changed state. */
  updatedAt: string;
  /** Last error message (on failure/retry). */
  lastError?: string;
  /** Optional opaque payload (e.g. workflow template id). */
  payload?: Record<string, unknown>;
}

/** Inputs to enqueueResearch. */
export interface EnqueueInput {
  id: string;
  runId: string;
  priority?: QueuePriority;
  maxAttempts?: number;
  availableAt?: string;
  payload?: Record<string, unknown>;
}

/** A snapshot summary of the queue (for the operations dashboard). */
export interface QueueStats {
  total: number;
  byStatus: Record<QueueItemStatus, number>;
  byPriority: Record<QueuePriority, number>;
  /** Items eligible to be dequeued right now. */
  ready: number;
  /** Oldest queued item's age in ms (0 if none). */
  oldestWaitMs: number;
}

/** Result of an operation that may reject (never throws). */
export type QueueResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
