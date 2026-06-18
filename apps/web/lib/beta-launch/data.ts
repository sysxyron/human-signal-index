// =============================================================================
// HSI Phase 60 — Beta Launch composed read model (SERVER-ONLY, read).
//
// Composes the existing cached intelligence (getBetaOperations for users/health/
// risk; getReleaseReadiness for the launch-readiness score) with the new
// cohort/invite/feedback/onboarding operational reads. No duplicate aggregations.
// =============================================================================

import { getBetaOperations, type BetaOperationsData } from '../beta-operations';
import { getReleaseReadiness, type ReleaseReadinessData } from '../release-readiness';
import { loadBetaLaunchOps, type BetaLaunchOps } from './persistence';

export interface LaunchStage {
  current: 1 | 2 | 3 | 4;
  label: string;
  range: string;
  nextMilestone: string;
}

export interface BetaLaunchData {
  beta: BetaOperationsData;
  release: ReleaseReadinessData;
  ops: BetaLaunchOps;
  stage: LaunchStage;
}

function stageFor(totalUsers: number): LaunchStage {
  if (totalUsers <= 10) return { current: 1, label: 'Stage 1 — Closed alpha', range: '1–10 users', nextMilestone: 'Reach 10 active users to open Stage 2' };
  if (totalUsers <= 25) return { current: 2, label: 'Stage 2 — Early beta', range: '10–25 users', nextMilestone: 'Reach 25 active users to open the expanded beta' };
  if (totalUsers <= 100) return { current: 3, label: 'Stage 3 — Expanded beta', range: '25–100 users', nextMilestone: 'Stabilize at 100 users before scaling toward 500' };
  return { current: 4, label: 'Stage 4 — Scaling', range: '100–500 users', nextMilestone: 'Add single-flight caching + shared rate-limit store before 1000' };
}

export async function getBetaLaunchData(role: string | null): Promise<BetaLaunchData> {
  const [beta, release] = await Promise.all([getBetaOperations(), getReleaseReadiness(role)]);
  const ops = await loadBetaLaunchOps(beta.overview.totalUsers);
  return { beta, release, ops, stage: stageFor(beta.overview.totalUsers) };
}
