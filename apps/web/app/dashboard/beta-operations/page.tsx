// =============================================================================
// HSI Phase 50 — Beta Operations Center (/dashboard/beta-operations). Server
// Component, force-dynamic, ADMIN-ONLY (self-gated, same pattern as the Launch
// Operations Center). Answers "how is the platform itself performing?" — beta
// growth, health, engagement, workload, adoption, risks, and readiness. Read-only;
// reuses the cached intelligence layers + aggregate user/role counts. Touches no
// RBAC/IAM/auth/billing/workflow.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { getBetaOperations } from '@/lib/beta-operations';
import {
  ExecutiveSummaryPanel, BetaOverviewPanel, PlatformHealthPanel, UserActivityPanel,
  WorkloadHealthPanel, AdoptionDashboard, PlatformRisksPanel, FeedbackCenter,
} from '@/components/beta-operations/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BetaOperationsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);

  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Beta Operations" subtitle="Platform performance command center" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'The Beta Operations Center is available to administrators.' : 'Sign in to view beta operations.'}
            redirectedFrom="/dashboard/beta-operations"
          />
        </main>
      </>
    );
  }

  const data = await getBetaOperations();

  return (
    <>
      <TopNav title="Beta Operations" subtitle="How the platform itself is performing — growth, health, bottlenecks, readiness" />
      <main className="space-y-6 p-5 lg:p-6">
        {/* Part 9 — executive summary */}
        <ExecutiveSummaryPanel summary={data.summary} />

        {/* Part 1 — beta overview + role distribution */}
        <BetaOverviewPanel overview={data.overview} />

        {/* Part 2 — platform health + trend */}
        <PlatformHealthPanel health={data.health} />

        {/* Part 3 + Part 4 — user activity & engagement, Part 5 — workload */}
        <div className="grid gap-4 xl:grid-cols-2">
          <UserActivityPanel activity={data.activity} engagement={data.engagement} />
          <WorkloadHealthPanel workload={data.workload} />
        </div>

        {/* Part 6 — adoption, Part 7 — platform risks */}
        <div className="grid gap-4 xl:grid-cols-2">
          <AdoptionDashboard adoption={data.adoption} />
          <PlatformRisksPanel risks={data.risks} />
        </div>

        {/* Part 8 — feedback center (placeholder, read-only) */}
        <FeedbackCenter feedback={data.feedback} />
      </main>
    </>
  );
}
