// =============================================================================
// HSI Phase 22 — Executive Command Center (/dashboard/executive). Server
// Component, force-dynamic. THE COMMAND LAYER: the executive snapshot (attention +
// counts + summary), the daily intelligence callout, the forecast/consensus/
// operations panels, and the top strategic priorities. Researcher+ view.
//
// This page creates no new intelligence — it OPERATES Phases 1-21. Every figure
// is advisory; all decisions require human governance. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Command, Info, ListChecks } from 'lucide-react';
import type { ExecutiveCommandData, ExecutiveBriefingsData } from '@hsi/shared-types';
import { getExecutiveCommandAction, getExecutiveBriefingsAction } from '@/lib/executive/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoExecutiveCommand, demoExecutiveBriefings } from '@/lib/executive/view';
import { ExecutiveNav } from '@/components/executive/ExecutiveNav';
import { ExecutiveSnapshot } from '@/components/executive/ExecutiveSnapshot';
import { ExecutivePanels } from '@/components/executive/panels';
import { PriorityBoard } from '@/components/executive/PriorityBoard';
import { DailyIntelligenceCard } from '@/components/executive/DailyIntelligenceCard';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExecutivePage() {
  const [res, briefRes, role, user] = await Promise.all([getExecutiveCommandAction(), getExecutiveBriefingsAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ExecutiveCommandData | null = null;
  let briefs: ExecutiveBriefingsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutiveCommand(); isDemo = true; }
  else errored = { message: res.error, code: res.code };
  briefs = briefRes.ok ? briefRes.data : demoExecutiveBriefings();

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Executive Command Center" subtitle="What is happening now, what matters most, and what needs attention — across all intelligence" />
      <main className="space-y-6 p-5 lg:p-6">
        <ExecutiveNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Command className="h-5 w-5 text-electric" /> System state</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            The command center creates <span className="font-semibold text-text-primary">no new intelligence</span> — it ranks
            attention and surfaces signals from every subsystem (Phases 1-21). Every priority, risk, and opportunity is
            advisory; all decisions require human governance. Nothing auto-publishes, auto-approves, auto-acts, or auto-governs.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing the command center requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load command center" message={errored.message} code={errored.code} redirectedFrom="/dashboard/executive" />
        ) : !data ? null : (
          <div className="space-y-6">
            <ExecutiveSnapshot data={data} />
            {briefs ? <DailyIntelligenceCard data={briefs} /> : null}
            <ExecutivePanels data={data} />
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ListChecks className="h-4 w-4 text-electric" /> Top strategic priorities</h3>
              <PriorityBoard priorities={data.priorities.slice(0, 8)} />
            </section>
          </div>
        )}
      </main>
    </>
  );
}
