// =============================================================================
// HSI Phase 60 — Beta Launch composed read model (SERVER-ONLY, read).
//
// Composes the existing cached intelligence (getBetaOperations for users/health/
// risk; getReleaseReadiness for the launch-readiness score) with the new
// cohort/invite/feedback/onboarding operational reads. No duplicate aggregations.
//
// Because the composition fans out across many cached layers, ANY one layer
// throwing (e.g. a missing table/column or a transient backend error in
// production) would otherwise crash the entire admin route. The composition is
// therefore wrapped in a guard that degrades to a safe `available:false` result
// so the page renders an internal empty state. Pure stage/fallback logic lives in
// `./status` so it stays unit-testable without `next/cache`.
// =============================================================================

import { getBetaOperations } from '../beta-operations';
import { getReleaseReadiness } from '../release-readiness';
import { loadBetaLaunchOps } from './persistence';
import { stageFor, degradedBetaLaunch, type BetaLaunchData } from './status';

// Types live in the dependency-free `./status` module; re-exported here for
// existing importers (e.g. the panels' `LaunchStage`).
export type { LaunchStage, BetaLaunchData } from './status';

export async function getBetaLaunchData(role: string | null): Promise<BetaLaunchData> {
  try {
    const [beta, release] = await Promise.all([getBetaOperations(), getReleaseReadiness(role)]);
    const ops = await loadBetaLaunchOps(beta.overview.totalUsers);
    return { available: true, statusReason: null, beta, release, ops, stage: stageFor(beta.overview.totalUsers) };
  } catch {
    return degradedBetaLaunch(role);
  }
}
