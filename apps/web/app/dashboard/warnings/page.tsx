// =============================================================================
// HSI Phase 21 — Early Warnings (/dashboard/warnings). Server Component,
// force-dynamic. getWarningsBoardAction() returns the INFO/WATCH/WARNING/CRITICAL
// early-warning alerts (emerging patterns, signal acceleration, trust collapse,
// narrative shift, consensus instability, forecast risk) + forecast alerts, with
// level breakdowns. A curator acknowledges/resolves. Answers "what early warnings
// exist?". Alerts are advisory — never auto-acted. Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Siren, Info } from 'lucide-react';
import type { WarningsBoardData, WarningLevel } from '@hsi/shared-types';
import { getWarningsBoardAction, resolveWarningAction } from '@/lib/forecasting/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canCurate, canResearch, demoWarningsBoard, readStringArray, warningLevelDecor } from '@/lib/forecasting/view';
import { ForecastingNav } from '@/components/forecasting/ForecastingNav';
import { WarningLevelBadge } from '@/components/forecasting/badges';
import { ResolveWarningControl } from '@/components/forecasting/controls';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WarningsPage() {
  const [res, role, user] = await Promise.all([getWarningsBoardAction(), getSessionRole(), getUser()]);
  const mayView = canResearch(role) && Boolean(user);
  const mayCurate = canCurate(role) && Boolean(user);

  let data: WarningsBoardData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoWarningsBoard(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const warnings = data?.warnings ?? [];
  const LEVELS: WarningLevel[] = ['CRITICAL', 'WARNING', 'WATCH', 'INFO'];

  return (
    <>
      <TopNav title="Early warnings" subtitle="What needs watching — advisory alerts, never auto-acted" />
      <main className="space-y-6 p-5 lg:p-6">
        <ForecastingNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <Siren className="h-5 w-5 text-electric" /> Early-warning board
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Early warnings detect emerging patterns, acceleration, trust collapse, narrative shifts, consensus
            instability, and forecast risk. They are <span className="font-semibold text-text-primary">advisory</span> — a
            human acknowledges or resolves each; nothing auto-acts or auto-escalates.
          </p>
        </Card>

        {data ? (
          <Card className="flex flex-wrap items-center gap-4 border-border" padded>
            <span className="text-label uppercase tracking-wide text-text-muted">By level</span>
            {LEVELS.map((l) => (
              <div key={l} className="flex items-center gap-1.5">
                <WarningLevelBadge level={l} />
                <span className="tabular-nums text-caption font-semibold text-text-primary">{data!.byLevel[l]}</span>
              </div>
            ))}
          </Card>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing warnings requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load warnings" message={errored.message} code={errored.code} redirectedFrom="/dashboard/warnings" />
        ) : warnings.length === 0 ? (
          <EmptyState icon={<Siren className="h-5 w-5" />} title="No early warnings" message="The forecast worker raises warnings as it detects emerging risks." />
        ) : (
          <div className="space-y-3">
            {warnings.map((w) => {
              const decor = warningLevelDecor(w.level);
              return (
                <Card key={w.id} className="space-y-2 border-border" padded style={{ borderLeft: `3px solid ${decor.color}` }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-text-primary">{w.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted">{w.kind}</span>
                      <WarningLevelBadge level={w.level} />
                    </div>
                  </div>
                  <p className="text-caption text-text-secondary">{w.signal}</p>
                  {w.recommendation ? <p className="rounded-card border border-border bg-surface/50 p-2 text-[12px] text-text-secondary"><span className="font-semibold text-text-primary">Recommendation: </span>{w.recommendation}</p> : null}
                  {readStringArray(w.evidence).length > 0 ? (
                    <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-text-muted">{readStringArray(w.evidence).map((e, i) => <li key={i}>{e}</li>)}</ul>
                  ) : null}
                  <ResolveWarningControl warningId={w.id} status={w.status} action={resolveWarningAction} canAct={mayCurate} demo={isDemo} />
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
