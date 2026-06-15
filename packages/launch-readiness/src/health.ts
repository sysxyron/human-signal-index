// =============================================================================
// Worker / queue / service health (Deliverables 2–4). PURE + DETERMINISTIC
// (`now` injected). A worker is DOWN if it never ran or is >3× its interval
// overdue; DEGRADED if overdue once or has recent failures; else HEALTHY.
// =============================================================================

import type { HealthStatus, QueueCounts, QueueHealth, WorkerHealth, WorkerHealthInput } from './types';

export function workerHealth(i: WorkerHealthInput, nowMs: number): WorkerHealth {
  if (!i.lastRunAt) return { name: i.name, status: 'down', ageMs: null, recentFailures: i.recentFailures };
  const last = Date.parse(i.lastRunAt);
  if (Number.isNaN(last)) return { name: i.name, status: 'unknown', ageMs: null, recentFailures: i.recentFailures };
  const age = nowMs - last;
  let status: HealthStatus;
  if (age > i.expectedIntervalMs * 3) status = 'down';
  else if (age > i.expectedIntervalMs || i.recentFailures > 0) status = 'degraded';
  else status = 'healthy';
  return { name: i.name, status, ageMs: age, recentFailures: i.recentFailures };
}

export function queueHealth(c: QueueCounts): QueueHealth {
  const decided = c.failed + c.completed;
  const failureRate = decided > 0 ? Math.round((c.failed / decided) * 100) : 0;
  const backlog = c.pending + c.running;
  let status: HealthStatus;
  if (failureRate >= 25) status = 'down';
  else if (failureRate >= 5 || backlog > 1000) status = 'degraded';
  else status = 'healthy';
  return { status, failureRate, backlog };
}

/** Roll several statuses into the worst (down > degraded > healthy > unknown). */
export function worstStatus(statuses: HealthStatus[]): HealthStatus {
  const rank: Record<HealthStatus, number> = { down: 3, degraded: 2, unknown: 1, healthy: 0 };
  return statuses.reduce<HealthStatus>((worst, s) => (rank[s] > rank[worst] ? s : worst), 'healthy');
}
