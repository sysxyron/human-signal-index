// =============================================================================
// HSI Phase 21 — Scenarios board (/dashboard/scenarios). Server Component,
// force-dynamic. getScenariosBoardAction() returns scenarios (competing future
// hypotheses) with their state + likelihood, and a live ScenarioComparison.
// Curator+ open a scenario. Researcher+ view. Answers "what scenarios are
// emerging?".
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { GitBranch, Info } from 'lucide-react';
import type { ScenariosBoardData } from '@hsi/shared-types';
import { createScenarioAction, getScenariosBoardAction } from '@/lib/forecasting/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoScenariosBoard, formatPct } from '@/lib/forecasting/view';
import { ForecastingNav } from '@/components/forecasting/ForecastingNav';
import { ScenarioStateBadge } from '@/components/forecasting/badges';
import { ScenarioComparison } from '@/components/forecasting/ScenarioViews';
import { CreateScenarioControl } from '@/components/forecasting/controls';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ScenariosPage() {
  const [res, role, user] = await Promise.all([getScenariosBoardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: ScenariosBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoScenariosBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const scenarios = data?.scenarios ?? [];

  return (
    <>
      <TopNav title="Scenarios" subtitle="Competing future hypotheses — scored, ranked, and tracked" />
      <main className="space-y-6 p-5 lg:p-6">
        <ForecastingNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <GitBranch className="h-5 w-5 text-electric" /> Emerging scenarios
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Scenario likelihoods are <span className="font-semibold text-text-primary">hypotheses</span>, not probabilities of
            truth. They require human judgement; nothing auto-confirms.
          </p>
        </Card>

        {mayCurate && !isDemo ? (
          <Card className="border-border" padded>
            <CreateScenarioControl action={createScenarioAction} canAct={mayCurate} demo={isDemo} />
          </Card>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing scenarios requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load scenarios" message={errored.message} code={errored.code} redirectedFrom="/dashboard/scenarios" />
        ) : !data ? null : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              {scenarios.length === 0 ? (
                <EmptyState icon={<GitBranch className="h-5 w-5" />} title="No scenarios yet" message="Open a scenario, or let the forecast worker surface emerging ones." />
              ) : scenarios.map((s) => (
                <Link key={s.id} href={`/dashboard/scenarios/${s.id}` as never} className="block">
                  <Card className="space-y-2 border-border transition hover:border-electric/50" padded>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-h6 font-semibold text-text-primary">{s.title}</h3>
                      <ScenarioStateBadge state={s.state} />
                    </div>
                    <p className="line-clamp-2 text-caption text-text-secondary">{s.description}</p>
                    <div className="flex items-center gap-2 text-caption">
                      <span className="text-text-muted">likelihood</span>
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-electric" style={{ width: `${Math.min(100, (s.likelihood ?? 0) * 100)}%` }} />
                      </div>
                      <span className="font-semibold tabular-nums text-text-primary">{formatPct(s.likelihood)}</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            <ScenarioComparison comparison={data.comparison} />
          </div>
        )}
      </main>
    </>
  );
}
