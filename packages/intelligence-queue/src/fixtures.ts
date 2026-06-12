// =============================================================================
// @hsi/intelligence-queue — deterministic offline fixtures + demo.
// =============================================================================

import { enqueueResearch, dequeueResearch, queueStats } from './queue';
import type { QueueItem } from './types';

export const FIXTURE_NOW = '2026-06-09T12:00:00.000Z';

/** A deterministic seed queue spanning priorities + statuses. */
export function seedQueue(): QueueItem[] {
  let queue: QueueItem[] = [];
  const items: Array<{ id: string; runId: string; priority: QueueItem['priority'] }> = [
    { id: 'q-crit', runId: 'run-1', priority: 'CRITICAL' },
    { id: 'q-high', runId: 'run-2', priority: 'HIGH' },
    { id: 'q-norm', runId: 'run-3', priority: 'NORMAL' },
    { id: 'q-low', runId: 'run-4', priority: 'LOW' },
  ];
  for (const it of items) {
    const res = enqueueResearch(queue, it, { now: FIXTURE_NOW });
    if (res.ok) queue = res.data.queue;
  }
  return queue;
}

/** Run the queue through a deterministic enqueue → dequeue cycle for a demo. */
export function queueDemo(): {
  now: string;
  queue: QueueItem[];
  firstDequeued: QueueItem | null;
  stats: ReturnType<typeof queueStats>;
} {
  const queue = seedQueue();
  const deq = dequeueResearch(queue, { now: FIXTURE_NOW });
  const after = deq.ok ? deq.data.queue : queue;
  return {
    now: FIXTURE_NOW,
    queue: after,
    firstDequeued: deq.ok ? deq.data.item : null,
    stats: queueStats(after, FIXTURE_NOW),
  };
}
