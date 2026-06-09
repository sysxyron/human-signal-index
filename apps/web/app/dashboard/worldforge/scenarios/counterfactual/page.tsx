// =============================================================================
// HSI Phase 12 — WorldForge Scenarios (/dashboard/worldforge/scenarios/
// counterfactual). Server Component, force-dynamic. getWorldforgeScenariosAction():
// materialized alternative-timeline scenarios — title, the alternative narrative
// outcome summary, probability/confidence band, key world-state metrics, and a
// link to the source counterfactual run. Researcher+ can generate a new scenario
// from a counterfactual run (generateWorldforgeScenarioAction). Offline
// (NOT_CONFIGURED) → labeled demo from counterfactualDemo() fixtures.
//
// NOTE: nested under the existing Scenario Sandbox segment to avoid colliding
// with /dashboard/worldforge/scenarios (a pre-existing Phase route).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { Globe2, Info, ArrowRight } from 'lucide-react';
import type { WorldforgeScenariosView } from '@hsi/shared-types';
import {
  getWorldforgeScenariosAction,
  generateWorldforgeScenarioAction,
} from '@/lib/simulation/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoWorldforgeScenarios } from '@/lib/simulation/view';
import { SimNav } from '@/components/simulation/SimNav';
import { DemoBadge } from '@/components/signals/badges';
import {
  EmptyState,
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';
import { WorldforgeScenarioCard } from '@/components/simulation/WorldforgeScenarioCard';
import { GenerateScenarioButton } from '@/components/simulation/GenerateScenarioButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldforgeScenariosPage() {
  const [res, role, user] = await Promise.all([
    getWorldforgeScenariosAction(),
    getSessionRole(),
    getUser(),
  ]);
  const canGenerate = canResearch(role) && Boolean(user);

  let view: WorldforgeScenariosView | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    view = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    view = demoWorldforgeScenarios();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  const narrativeNames = new Map<string, string>(
    view?.narratives.map((n) => [n.id, n.name]) ?? [],
  );

  const scenarios = view?.scenarios ?? [];

  return (
    <>
      <TopNav
        title="WorldForge Scenarios"
        subtitle="Alternative timelines materialized from counterfactual runs"
      />
      <main className="space-y-6 p-5 lg:p-6">
        <SimNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Globe2 className="h-5 w-5 text-electric" /> WorldForge scenarios
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
          <Link
            href={'/dashboard/simulation' as never}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-electric hover:text-white"
          >
            Run a counterfactual <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            A WorldForge scenario renders a counterfactual run as an alternative timeline:
            a &quot;what if?&quot; title, the alternate narrative outcome, the alternate
            world-state metrics, and a confidence. Like every simulation output, it is a{' '}
            <span className="font-semibold text-text-primary">
              grounded estimate for human review
            </span>
            , not a prediction of what would have happened.
          </p>
        </Card>

        {errored ? (
          <ErrorState
            title="Could not load WorldForge scenarios"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/worldforge/scenarios/counterfactual"
          />
        ) : scenarios.length === 0 ? (
          <EmptyState
            icon={<Globe2 className="h-5 w-5" />}
            title="No scenarios yet"
            message="Generate a scenario from any counterfactual run to materialize its alternative timeline here."
            action={
              <Link
                href={'/dashboard/simulation' as never}
                className="inline-flex items-center gap-2 rounded-btn border border-electric/40 bg-electric/10 px-3.5 py-2 text-caption font-semibold text-electric transition hover:border-electric hover:text-white"
              >
                Go to simulation
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {scenarios.map((s) => (
              <div key={s.id} className="space-y-2">
                <WorldforgeScenarioCard
                  scenario={s}
                  narrativeName={
                    s.run ? narrativeNames.get(s.run.narrative_id) : undefined
                  }
                />
                {s.run ? (
                  <GenerateScenarioButton
                    counterfactualRunId={s.run.id}
                    action={generateWorldforgeScenarioAction}
                    canGenerate={canGenerate}
                    demo={isDemo}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
