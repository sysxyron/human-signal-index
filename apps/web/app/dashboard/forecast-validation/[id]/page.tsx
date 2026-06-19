// =============================================================================
// HSI Phase 67 — Forecast detail (/dashboard/forecast-validation/[id]). Server
// Component, force-dynamic, reviewer+ (admins record outcome / resolve / expire).
// Forecast + prediction + outcome + evaluation history + timeline + alerts. RLS-gated.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../../components/dashboard-shell';
import { getForecast, getPrediction, getOutcome, getScore, getEvaluations, getAlerts } from '@/lib/forecasts/service';
import { ForecastSummaryPanel, ForecastTimelinePanel, ForecastEvaluationsPanel, ForecastAlertsPanel, StatusBadge } from '@/components/forecasts/panels';
import { OutcomeAndResolveControls } from '@/components/forecasts/ForecastControls';
import type { ForecastTimelineEvent } from '@/lib/forecasts/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ForecastDetailPage({ params }: { params: { id: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Forecast" subtitle="Forecast validation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to reviewers and admins.' : 'Sign in to continue.'} redirectedFrom={`/dashboard/forecast-validation/${params.id}`} />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const [fcRes, predRes, outRes, scoreRes, evalsRes, alertsRes] = await Promise.all([
    getForecast(params.id), getPrediction(params.id), getOutcome(params.id), getScore(params.id), getEvaluations(params.id), getAlerts(params.id),
  ]);

  if (!fcRes.ok) {
    return (
      <>
        <TopNav title="Forecast" subtitle="Forecast validation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code="DB_ERROR" title="Forecast not found" message={fcRes.error} redirectedFrom="/dashboard/forecast-validation" />
        </main>
      </>
    );
  }

  const forecast = fcRes.data;
  const prediction = predRes.ok ? predRes.data : null;
  const outcome = outRes.ok ? outRes.data : null;
  const score = scoreRes.ok ? scoreRes.data : null;
  const evals = evalsRes.ok ? evalsRes.data : [];
  const alerts = alertsRes.ok ? alertsRes.data : [];

  const timeline: ForecastTimelineEvent[] = [
    { event: 'created', at: forecast.createdAt, detail: `as ${forecast.predictionType}` },
    { event: 'activated', at: forecast.forecastDate, detail: forecast.confidence != null ? `confidence ${Math.round(forecast.confidence * 100)}%` : null },
    ...(outcome ? [{ event: 'outcome recorded', at: outcome.recordedAt, detail: outcome.outcomeLabel ?? null }] : []),
    ...evals.map((e) => ({ event: e.result === 'expired' ? 'expired' : 'evaluated', at: e.evaluatedAt, detail: e.rationale })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <DashboardPage
      title={forecast.title}
      subtitle="Forecast — immutable, time-bound, evaluated against reality"
      actions={<StatusBadge status={forecast.status} />}
    >
      <div className="space-y-8">
        <ForecastSummaryPanel forecast={forecast} prediction={prediction} outcome={outcome} score={score} />
        {admin && (forecast.status === 'active' || forecast.status === 'draft') ? <OutcomeAndResolveControls id={forecast.id} type={forecast.predictionType} /> : null}
        <div className="grid gap-6 xl:grid-cols-2">
          <ForecastTimelinePanel events={timeline} />
          <ForecastEvaluationsPanel evals={evals} />
        </div>
        <ForecastAlertsPanel alerts={alerts} />
      </div>
    </DashboardPage>
  );
}
