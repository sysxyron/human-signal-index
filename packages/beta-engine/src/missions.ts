// =============================================================================
// Automatic mission assignment (Deliverables 6, 7). PURE.
// Picks role-appropriate missions the tester hasn't completed, capped to a queue
// size. Higher rank/badge history → can take more concurrent missions.
// =============================================================================

import type { AssignableMission, TesterProgress, TesterProgressInput } from './types';

/**
 * Assign a personalised mission queue. Given the role's available missions, drop
 * completed ones and cap the queue (rank/badges raise the cap). Deterministic.
 */
export function assignMissions(
  available: AssignableMission[],
  opts: { role: string; completedIds: string[]; rankLevel?: number; badgeCount?: number },
): AssignableMission[] {
  const completed = new Set(opts.completedIds);
  const roleMatch = available.filter((m) => m.role === opts.role || m.role === 'viewer');
  const fresh = roleMatch.filter((m) => !completed.has(m.id));
  const cap = Math.min(6, 2 + (opts.rankLevel ?? 1) + Math.floor((opts.badgeCount ?? 0) / 3));
  return fresh.slice(0, cap);
}

/** Tester progress / completion % (Deliverable 10). PURE. */
export function testerProgress(i: TesterProgressInput): TesterProgress {
  const completionPct = i.assignedMissions > 0
    ? Math.min(100, Math.round((i.completedMissions / i.assignedMissions) * 100))
    : 0;
  return { completionPct, completedMissions: i.completedMissions, assignedMissions: i.assignedMissions, xp: i.xp };
}

/** Has the tester met the completion bar (all assigned missions done, ≥1 assigned)? */
export function isProgramComplete(p: TesterProgress): boolean {
  return p.assignedMissions > 0 && p.completedMissions >= p.assignedMissions;
}
