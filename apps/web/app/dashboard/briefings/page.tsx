// =============================================================================
// HSI Phase 22 — Executive Briefings (/dashboard/briefings). Server Component,
// force-dynamic. The generated briefs — daily / weekly / critical / governance /
// forecast / operations — each explainable, evidence-linked, and advisory. A
// curator may persist a governance brief snapshot. Researcher+ view.
//
// Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { FileText, Info } from 'lucide-react';
import type { ExecutiveBriefingsData } from '@hsi/shared-types';
import { getExecutiveBriefingsAction, persistGovernanceBriefAction } from '@/lib/executive/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoExecutiveBriefings } from '@/lib/executive/view';
import { ExecutiveNav } from '@/components/executive/ExecutiveNav';
import { ExecutiveBriefViewer } from '@/components/executive/ExecutiveBriefViewer';
import { PersistBriefButton } from '@/components/executive/briefControls';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BriefingsPage() {
  const [res, role, user] = await Promise.all([getExecutiveBriefingsAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: ExecutiveBriefingsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoExecutiveBriefings(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;

  return (
    <>
      <TopNav title="Executive Briefings" subtitle="The daily, weekly, critical, governance, forecast, and operations briefs — explainable and advisory" />
      <main className="space-y-6 p-5 lg:p-6">
        <ExecutiveNav />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><FileText className="h-5 w-5 text-electric" /> Briefs</h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <PersistBriefButton action={persistGovernanceBriefAction} canAct={mayCurate} demo={isDemo} />
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Every brief is <span className="font-semibold text-text-primary">advisory</span> — each section links to its sources
            and the brief is never auto-sent or auto-published. Leadership review is required before any action.
          </p>
        </Card>

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing briefings requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load briefings" message={errored.message} code={errored.code} redirectedFrom="/dashboard/briefings" />
        ) : !data ? null : data.briefs.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No briefs yet" message="The executive worker generates briefs from the unified system state each hour." />
        ) : (
          <div className="space-y-4">
            {data.briefs.map((b) => <ExecutiveBriefViewer key={b.id} brief={b} />)}
          </div>
        )}
      </main>
    </>
  );
}
