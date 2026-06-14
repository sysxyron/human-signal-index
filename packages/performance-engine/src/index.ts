// =============================================================================
// @hsi/performance-engine — operational performance metrics (HSI Phase 24).
//
// PURE + DETERMINISTIC (now injected; no Date.now()/Math.random()). Metrics are
// INFORMATIONAL ONLY — there is NO gamification, no ranking, no scoring of
// people. The engine summarizes throughput and timing to help humans plan.
// =============================================================================

export type WorkEventType =
  | 'completed'
  | 'reviewed'
  | 'published'
  | 'escalated'
  | 'assigned';

/** A timestamped operational event used to compute metrics. */
export interface WorkEvent {
  type: WorkEventType;
  actor?: string;
  team?: string;
  /** ISO timestamp the event occurred. */
  at: string;
  /** Response time (ms) from creation to first action, when known. */
  responseMs?: number;
  /** Completion time (ms) from creation to completion, when known. */
  completionMs?: number;
}

export interface PerformanceMetrics {
  windowDays: number;
  casesCompleted: number;
  reviewThroughput: number; // reviews in window
  publicationThroughput: number; // publishes in window
  escalationVolume: number;
  avgResponseMs: number | null;
  avgCompletionMs: number | null;
  /** Net backlog reduction = completed - newly assigned (can be negative). */
  backlogReduction: number;
  /** Informational only — never a ranking or score of people. */
  note: string;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Summarize operational performance over the trailing `windowDays` from `now`.
 * Events outside the window are ignored. Pure.
 */
export function computePerformance(
  events: WorkEvent[],
  opts: { now: string; windowDays?: number },
): PerformanceMetrics {
  const windowDays = opts.windowDays ?? 30;
  const nowT = Date.parse(opts.now);
  const cutoff = Number.isNaN(nowT) ? -Infinity : nowT - windowDays * 24 * 3600 * 1000;

  const inWindow = events.filter((e) => {
    const t = Date.parse(e.at);
    return !Number.isNaN(t) && t >= cutoff && t <= nowT;
  });

  const completed = inWindow.filter((e) => e.type === 'completed');
  const reviewed = inWindow.filter((e) => e.type === 'reviewed');
  const published = inWindow.filter((e) => e.type === 'published');
  const escalated = inWindow.filter((e) => e.type === 'escalated');
  const assigned = inWindow.filter((e) => e.type === 'assigned');

  const responseTimes = inWindow.map((e) => e.responseMs).filter((n): n is number => typeof n === 'number' && n >= 0);
  const completionTimes = completed.map((e) => e.completionMs).filter((n): n is number => typeof n === 'number' && n >= 0);

  return {
    windowDays,
    casesCompleted: completed.length,
    reviewThroughput: reviewed.length,
    publicationThroughput: published.length,
    escalationVolume: escalated.length,
    avgResponseMs: avg(responseTimes),
    avgCompletionMs: avg(completionTimes),
    backlogReduction: completed.length - assigned.length,
    note: 'Informational only. These metrics summarize throughput and timing — they are not a ranking or score of individuals.',
  };
}

/** Per-actor throughput summary (informational; not a leaderboard). */
export interface ActorThroughput {
  actor: string;
  completed: number;
  reviewed: number;
  published: number;
}

export function perActorThroughput(events: WorkEvent[], opts: { now: string; windowDays?: number }): ActorThroughput[] {
  const windowDays = opts.windowDays ?? 30;
  const nowT = Date.parse(opts.now);
  const cutoff = Number.isNaN(nowT) ? -Infinity : nowT - windowDays * 24 * 3600 * 1000;
  const byActor = new Map<string, ActorThroughput>();
  for (const e of events) {
    if (!e.actor) continue;
    const t = Date.parse(e.at);
    if (Number.isNaN(t) || t < cutoff || t > nowT) continue;
    const row = byActor.get(e.actor) ?? { actor: e.actor, completed: 0, reviewed: 0, published: 0 };
    if (e.type === 'completed') row.completed += 1;
    if (e.type === 'reviewed') row.reviewed += 1;
    if (e.type === 'published') row.published += 1;
    byActor.set(e.actor, row);
  }
  // Alphabetical (NOT ranked) to avoid implying a leaderboard.
  return [...byActor.values()].sort((a, b) => a.actor.localeCompare(b.actor));
}
