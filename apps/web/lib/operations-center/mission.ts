// =============================================================================
// HSI Phase 73 — Mission summary status (PURE, deterministic). Maps real ratios/
// counts to GREEN / YELLOW / RED using thresholds documented HERE in code — no AI
// assessment. Every domain explains the ratio behind its status. No I/O.
// =============================================================================

import type { MissionStatus, MissionDomain } from './types';

/** Higher is better (e.g. healthy ratio). GREEN ≥ green, YELLOW ≥ yellow, else RED.
 *  An empty universe (total 0) is UNKNOWN-ish → YELLOW (nothing to be confident about). */
export function ratioStatus(value: number, total: number, green = 0.7, yellow = 0.4): MissionStatus {
  if (total <= 0) return 'YELLOW';
  const r = value / total;
  if (r >= green) return 'GREEN';
  if (r >= yellow) return 'YELLOW';
  return 'RED';
}

/** Lower is better (e.g. offline ratio, backlog ratio). GREEN ≤ green, YELLOW ≤ yellow, else RED. */
export function inverseRatioStatus(bad: number, total: number, green = 0.1, yellow = 0.3): MissionStatus {
  if (total <= 0) return 'GREEN'; // nothing bad because nothing exists
  const r = bad / total;
  if (r <= green) return 'GREEN';
  if (r <= yellow) return 'YELLOW';
  return 'RED';
}

/** A raw backlog count → status (absolute thresholds). */
export function backlogStatus(count: number, green = 10, yellow = 50): MissionStatus {
  if (count <= green) return 'GREEN';
  if (count <= yellow) return 'YELLOW';
  return 'RED';
}

const RANK: Record<MissionStatus, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
/** Overall = worst domain (RED dominates YELLOW dominates GREEN). Empty → YELLOW. */
export function overallMission(domains: MissionDomain[]): MissionStatus {
  if (domains.length === 0) return 'YELLOW';
  return domains.reduce<MissionStatus>((worst, d) => (RANK[d.status] > RANK[worst] ? d.status : worst), 'GREEN');
}

export function statusRank(s: MissionStatus): number { return RANK[s]; }
