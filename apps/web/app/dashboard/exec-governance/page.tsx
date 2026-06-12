// =============================================================================
// HSI Phase 22 — Executive Governance (/dashboard/exec-governance). Server
// Component, force-dynamic. The executive review queue + decision log. A curator
// approves, rejects, or archives a queued review — reviewer + reason REQUIRED,
// previous status preserved, every decision reversible and audit-logged.
// Researcher+ view.
//
// NEVER auto-approves, auto-acts, or auto-governs. Offline → labeled demo.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { Gavel } from 'lucide-react';
import type { ExecutiveGovernanceData } from '@hsi/shared-types';
import { getExecutiveGovernanceAction, decideExecutiveReviewAction } from '@/lib/executive/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoExecutiveGovernance } from '@/lib/executive/view';
import { ExecutiveNav } from '@/components/executive/ExecutiveNav';
import { GovernanceQueue } from '@/components/executive/GovernanceQueue';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExecutiveGovernancePage() {
  const [res, role, user] = await Promise.all([getExecutiveGovernanceAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: ExecutiveGovernanceData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutiveGovernance(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Executive Governance" subtitle="The review queue + decision log — every decision is human, reasoned, reversible, and audit-logged" />
      <main className="space-y-6 p-5 lg:p-6">
        <ExecutiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Gavel className="h-5 w-5 text-electric" /> Governance</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing governance requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load governance" message={errored.message} code={errored.code} redirectedFrom="/dashboard/exec-governance" />
        ) : !data ? null : (
          <GovernanceQueue data={data} decideAction={decideExecutiveReviewAction} canCurate={mayCurate} demo={isDemo} />
        )}
      </main>
    </>
  );
}
