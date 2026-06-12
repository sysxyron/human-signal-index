// =============================================================================
// @hsi/intelligence-queue — the pure priority-queue engine.
//
// Operations: enqueue / dequeue / retry / cancel / prioritize, plus peek + stats.
// Every operation returns a NEW queue array (inputs are never mutated). Ordering
// is deterministic: by priority (CRITICAL→LOW), then availableAt (oldest first),
// then enqueuedAt, then id. A "ready" item is `queued`/`retrying` with
// availableAt ≤ now. Nothing is dropped silently — cancel/fail are explicit
// terminal states.
// =============================================================================

import type {
  EnqueueInput,
  QueueItem,
  QueuePriority,
  QueueItemStatus,
  QueueResult,
  QueueStats,
} from './types';

/** Numeric rank for priority ordering (lower = dequeued first). */
export const PRIORITY_RANK: Record<QueuePriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export const DEFAULT_MAX_ATTEMPTS = 3;

/** Exponential backoff (ms) for a retry attempt: 1m, 5m, 15m, … capped at 1h. */
export function backoffMs(attempt: number): number {
  const table = [60_000, 300_000, 900_000, 1_800_000, 3_600_000];
  return table[Math.min(attempt, table.length - 1)];
}

function ts(at: string): number {
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

/** The canonical deterministic queue ordering (does NOT mutate the input). */
export function orderQueue(queue: QueueItem[]): QueueItem[] {
  return queue.slice().sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const av = ts(a.availableAt) - ts(b.availableAt);
    if (av !== 0) return av;
    const en = ts(a.enqueuedAt) - ts(b.enqueuedAt);
    if (en !== 0) return en;
    return a.id.localeCompare(b.id);
  });
}

function isReady(item: QueueItem, now: string): boolean {
  return (
    (item.status === 'queued' || item.status === 'retrying') &&
    ts(item.availableAt) <= ts(now)
  );
}

/**
 * Enqueue a new research item. Rejects a duplicate id (never silently overwrites).
 * Returns the new queue. Deterministic — pass `now` via opts.
 */
export function enqueueResearch(
  queue: QueueItem[],
  input: EnqueueInput,
  opts: { now: string },
): QueueResult<{ queue: QueueItem[]; item: QueueItem }> {
  if (queue.some((q) => q.id === input.id)) {
    return { ok: false, error: `Queue item '${input.id}' already exists.` };
  }
  const item: QueueItem = {
    id: input.id,
    runId: input.runId,
    priority: input.priority ?? 'NORMAL',
    status: 'queued',
    attempts: 0,
    maxAttempts: Math.max(1, input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
    enqueuedAt: opts.now,
    availableAt: input.availableAt ?? opts.now,
    updatedAt: opts.now,
    ...(input.payload ? { payload: input.payload } : {}),
  };
  return { ok: true, data: { queue: [...queue, item], item } };
}

/**
 * Dequeue the highest-priority READY item, marking it `active` (attempts++). When
 * no item is ready, returns item:null with the queue unchanged. Deterministic.
 */
export function dequeueResearch(
  queue: QueueItem[],
  opts: { now: string },
): QueueResult<{ queue: QueueItem[]; item: QueueItem | null }> {
  const ready = orderQueue(queue.filter((q) => isReady(q, opts.now)));
  const next = ready[0];
  if (!next) return { ok: true, data: { queue, item: null } };

  const updated: QueueItem = {
    ...next,
    status: 'active',
    attempts: next.attempts + 1,
    updatedAt: opts.now,
  };
  return {
    ok: true,
    data: {
      queue: queue.map((q) => (q.id === next.id ? updated : q)),
      item: updated,
    },
  };
}

/** Mark an active item completed. Rejects unknown id. */
export function completeResearch(
  queue: QueueItem[],
  id: string,
  opts: { now: string },
): QueueResult<{ queue: QueueItem[] }> {
  return mutate(queue, id, (item) => ({
    ...item,
    status: 'completed',
    updatedAt: opts.now,
  }));
}

/**
 * Mark an item failed. If attempts < maxAttempts it becomes `retrying` with a
 * backoff availableAt; otherwise it is terminally `failed`. Records lastError.
 */
export function failResearch(
  queue: QueueItem[],
  id: string,
  error: string,
  opts: { now: string },
): QueueResult<{ queue: QueueItem[]; willRetry: boolean }> {
  const target = queue.find((q) => q.id === id);
  if (!target) return { ok: false, error: `Queue item '${id}' not found.` };
  const willRetry = target.attempts < target.maxAttempts;
  const availableAt = new Date(Date.parse(opts.now) + backoffMs(target.attempts)).toISOString();
  const updated: QueueItem = {
    ...target,
    status: willRetry ? 'retrying' : 'failed',
    lastError: error,
    availableAt: willRetry ? availableAt : target.availableAt,
    updatedAt: opts.now,
  };
  return {
    ok: true,
    data: { queue: queue.map((q) => (q.id === id ? updated : q)), willRetry },
  };
}

/**
 * Explicitly re-queue a failed/retrying item NOW (manual retry), resetting it to
 * `queued` and clearing the backoff. Rejects if the item is completed/cancelled.
 */
export function retryResearch(
  queue: QueueItem[],
  id: string,
  opts: { now: string },
): QueueResult<{ queue: QueueItem[] }> {
  const target = queue.find((q) => q.id === id);
  if (!target) return { ok: false, error: `Queue item '${id}' not found.` };
  if (target.status === 'completed' || target.status === 'cancelled') {
    return { ok: false, error: `Cannot retry a ${target.status} item.` };
  }
  return mutate(queue, id, (item) => ({
    ...item,
    status: 'queued',
    availableAt: opts.now,
    updatedAt: opts.now,
  }));
}

/** Cancel an item (terminal). Rejects cancelling a completed item. */
export function cancelResearch(
  queue: QueueItem[],
  id: string,
  opts: { now: string },
): QueueResult<{ queue: QueueItem[] }> {
  const target = queue.find((q) => q.id === id);
  if (!target) return { ok: false, error: `Queue item '${id}' not found.` };
  if (target.status === 'completed') {
    return { ok: false, error: 'Cannot cancel a completed item.' };
  }
  return mutate(queue, id, (item) => ({
    ...item,
    status: 'cancelled',
    updatedAt: opts.now,
  }));
}

/** Change an item's priority. Rejects unknown id. */
export function prioritizeResearch(
  queue: QueueItem[],
  id: string,
  priority: QueuePriority,
  opts: { now: string },
): QueueResult<{ queue: QueueItem[] }> {
  return mutate(queue, id, (item) => ({ ...item, priority, updatedAt: opts.now }));
}

/** Peek the next READY item without mutating the queue. */
export function peekQueue(queue: QueueItem[], now: string): QueueItem | null {
  return orderQueue(queue.filter((q) => isReady(q, now)))[0] ?? null;
}

/** Count items by status (optionally filter). */
export function queueDepth(queue: QueueItem[], status?: QueueItemStatus): number {
  return status ? queue.filter((q) => q.status === status).length : queue.length;
}

/** A full snapshot summary of the queue. */
export function queueStats(queue: QueueItem[], now: string): QueueStats {
  const byStatus: Record<QueueItemStatus, number> = {
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    retrying: 0,
  };
  const byPriority: Record<QueuePriority, number> = {
    CRITICAL: 0,
    HIGH: 0,
    NORMAL: 0,
    LOW: 0,
  };
  let ready = 0;
  let oldest = 0;
  const nowMs = ts(now);
  for (const q of queue) {
    byStatus[q.status] += 1;
    byPriority[q.priority] += 1;
    if (isReady(q, now)) {
      ready += 1;
      oldest = Math.max(oldest, nowMs - ts(q.enqueuedAt));
    }
  }
  return { total: queue.length, byStatus, byPriority, ready, oldestWaitMs: Math.max(0, oldest) };
}

/** Apply a pure update to a single item by id. NEVER mutates the input. */
function mutate(
  queue: QueueItem[],
  id: string,
  fn: (item: QueueItem) => QueueItem,
): QueueResult<{ queue: QueueItem[] }> {
  if (!queue.some((q) => q.id === id)) {
    return { ok: false, error: `Queue item '${id}' not found.` };
  }
  return { ok: true, data: { queue: queue.map((q) => (q.id === id ? fn(q) : q)) } };
}
