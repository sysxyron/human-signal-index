// =============================================================================
// HSI Phase 60 — Beta Launch Operations (/dashboard/beta-launch). Server
// Component, force-dynamic, ADMIN-ONLY (self-gated). The operational console for
// running the expanded beta: program overview, cohorts, invites, onboarding,
// feedback, health, participation, risk, executive summary, and stage tracking.
// Composes the cached intelligence layers + the new cohort/invite/feedback tables.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { getBetaLaunchData } from '@/lib/beta-launch/data';
import {
  ProgramOverview, OnboardingFunnel, BetaHealthDashboard, ResearchParticipation,
  RiskMonitoring, ExecutiveSummary, LaunchStageTracker,
} from '@/components/beta-launch/panels';
import { CohortManager } from '@/components/beta-launch/CohortManager';
import { InviteManager } from '@/components/beta-launch/InviteManager';
import { FeedbackManager } from '@/components/beta-launch/FeedbackManager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BetaLaunchPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Beta Launch" subtitle="Expanded beta operations" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'Beta Launch Operations is available to administrators.' : 'Sign in to manage the beta program.'}
            redirectedFrom="/dashboard/beta-launch"
          />
        </main>
      </>
    );
  }

  const { beta, release, ops, stage } = await getBetaLaunchData(role);
  const lowParticipation = {
    active: beta.overview.totalUsers > 0 && beta.engagement.participationRate < 40,
    detail: `Participation at ${beta.engagement.participationRate}% of users`,
  };

  return (
    <>
      <TopNav title="Beta Launch Operations" subtitle="Run the expanded beta — cohorts, invites, onboarding, feedback, health & risk" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Section 9 — executive summary */}
        <ExecutiveSummary beta={beta} releaseScore={release.score} />

        {/* Section 1 — program overview */}
        <ProgramOverview beta={beta} />

        {/* Section 10 — launch readiness tracking */}
        <LaunchStageTracker stage={stage} releaseScore={release.score} />

        {/* Section 6 — beta health */}
        <BetaHealthDashboard beta={beta} />

        {/* Section 7 — participation, Section 8 — risk */}
        <div className="grid gap-4 xl:grid-cols-2">
          <ResearchParticipation beta={beta} />
          <RiskMonitoring risks={beta.risks} lowParticipation={lowParticipation} />
        </div>

        {/* Section 4 — onboarding funnel */}
        <OnboardingFunnel steps={ops.onboarding} />

        {/* Section 2 — cohorts */}
        <CohortManager cohorts={ops.cohorts} />

        {/* Section 3 — invites */}
        <InviteManager summary={ops.invites.summary} recent={ops.invites.recent} events={ops.invites.events} cohorts={ops.cohorts} />

        {/* Section 5 — feedback */}
        <FeedbackManager summary={ops.feedback.summary} recent={ops.feedback.recent} />
      </main>
    </>
  );
}
