// =============================================================================
// HSI Phase 22 — Strategic Opportunities (/dashboard/opportunities). Server
// Component, force-dynamic. Opportunities derived from research opportunities,
// high-confidence reliable forecasts, and strong undisputed consensus — each with
// an advisory recommendation. Researcher+ view. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Sparkles, Info } from 'lucide-react';
import type { ExecutiveOpportunitiesData } from '@hsi/shared-types';
import { getExecutiveOpportunitiesAction } from '@/lib/executive/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoExecutiveOpportunities } from '@/lib/executive/view';
import { ExecutiveNav } from '@/components/executive/ExecutiveNav';
import { OpportunityBoard } from '@/components/executive/OpportunityBoard';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OpportunitiesPage() {
  const [res, role, user] = await Promise.all([getExecutiveOpportunitiesAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ExecutiveOpportunitiesData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutiveOpportunities(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Strategic Opportunities" subtitle="Where to lean in — opportunities across research, forecasts, and consensus" />
      <main className="space-y-6 p-5 lg:p-6">
        <ExecutiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Sparkles className="h-5 w-5 text-verified" /> Opportunity board</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Opportunities are <span className="font-semibold text-text-primary">advisory</span> — each names its source and a
            recommended (never automatic) next step. Verify before acting; route to governance to accept.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing opportunities requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load opportunities" message={errored.message} code={errored.code} redirectedFrom="/dashboard/opportunities" />
        ) : !data ? null : (
          <OpportunityBoard data={data} />
        )}
      </main>
    </>
  );
}
