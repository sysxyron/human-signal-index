// =============================================================================
// HSI Phase 21 — Scenario detail (/dashboard/scenarios/[id]). Server Component,
// force-dynamic. getScenarioDetailAction(id) returns the scenario, its branching
// tree (ScenarioTree), the live ranking across active scenarios
// (ScenarioComparison), and the version history. A curator advances the scenario
// state (validated, audited). Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ArrowLeft, GitBranch } from 'lucide-react';
import type { ScenarioDetailData } from '@hsi/shared-types';
import { getScenarioDetailAction, transitionScenarioAction } from '@/lib/forecasting/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoScenarioDetail, formatDateTime, formatPct, readStringArray } from '@/lib/forecasting/view';
import { ForecastingNav } from '@/components/forecasting/ForecastingNav';
import { ScenarioStateBadge } from '@/components/forecasting/badges';
import { ScenarioTree, ScenarioComparison } from '@/components/forecasting/ScenarioViews';
import { ScenarioTransitionControl } from '@/components/forecasting/controls';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ScenarioDetailPage({ params }: { params: { id: string } }) {
  const [res, role, user] = await Promise.all([getScenarioDetailAction(params.id), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: ScenarioDetailData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoScenarioDetail(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const s = data?.scenario;
  const drivers = s ? readDrivers(s.drivers) : [];

  return (
    <>
      <TopNav title="Scenario" subtitle="A future hypothesis — its drivers, tree, ranking, and lifecycle" />
      <main className="space-y-6 p-5 lg:p-6">
        <ForecastingNav />
        <Link href={'/dashboard/scenarios' as never} className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to scenarios
        </Link>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing scenarios requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the scenario" message={errored.message} code={errored.code} redirectedFrom={`/dashboard/scenarios/${params.id}`} />
        ) : !data || !s ? (
          <ErrorState title="Scenario not found" message="This scenario does not exist." />
        ) : (
          <div className="space-y-6">
            <Card className="space-y-2 border-border" padded>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-electric" />
                  <h2 className="text-h6 font-semibold text-text-primary">{s.title}</h2>
                  {isDemo ? <DemoBadge /> : null}
                </div>
                <ScenarioStateBadge state={s.state} />
              </div>
              <p className="text-caption text-text-secondary">{s.description}</p>
              <div className="flex items-center gap-2 text-caption">
                <span className="text-text-muted">likelihood</span>
                <span className="font-semibold tabular-nums text-text-primary">{formatPct(s.likelihood)}</span>
              </div>
              {drivers.length > 0 ? (
                <div>
                  <div className="text-label uppercase tracking-wide text-text-muted">Drivers</div>
                  <ul className="mt-1 space-y-1">
                    {drivers.map((d, i) => (
                      <li key={i} className="flex items-center justify-between text-caption">
                        <span className="text-text-secondary">{d.label}</span>
                        <span className="tabular-nums text-text-muted">presence {formatPct(d.presence)} · weight {formatPct(d.weight)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <ScenarioTree tree={data.tree} />
                <ScenarioComparison ranked={data.ranked} />
              </div>
              <div className="space-y-6">
                <Card className="space-y-3 border-border" padded>
                  <h3 className="text-h6 font-semibold text-text-primary">Advance scenario</h3>
                  <ScenarioTransitionControl scenarioId={s.id} state={s.state} action={transitionScenarioAction} canAct={mayCurate} demo={isDemo} />
                </Card>
                <Card className="space-y-3 border-border" padded>
                  <h3 className="text-h6 font-semibold text-text-primary">History</h3>
                  {data.versions.length === 0 ? (
                    <p className="text-caption text-text-muted">No transitions yet.</p>
                  ) : (
                    <ul className="space-y-1 text-caption text-text-secondary">
                      {data.versions.map((v) => (
                        <li key={v.id}>{v.from_state} → {v.to_state} · {formatDateTime(v.at ?? v.created_at)}{v.reason ? ` — ${v.reason}` : ''}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function readDrivers(value: unknown): { label: string; weight: number; presence: number }[] {
  const raw = Array.isArray(value) ? value : (value && typeof value === 'object' ? (value as Record<string, unknown>).items : undefined);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map((r) => ({ label: String(r.label ?? ''), weight: typeof r.weight === 'number' ? r.weight : 0, presence: typeof r.presence === 'number' ? r.presence : 0 }));
}
