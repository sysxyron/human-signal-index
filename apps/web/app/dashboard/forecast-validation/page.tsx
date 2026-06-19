// =============================================================================
// HSI Phase 67 — Forecast Validation (/dashboard/forecast-validation). Server
// Component, force-dynamic, reviewer+ (admins create/resolve). Active/resolved/
// expired counts, accuracy, calibration, readiness, executive lists, alerts.
// Validation only — no AI predictions, no autonomous forecasts. RLS-gated.
// (Distinct from the Phase 21 /dashboard/forecasts board, which is preserved.)
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getForecastsDashboard } from '@/lib/forecasts/data';
import { ForecastsOverview, PerformancePanel, CalibrationPanel, ReadinessPanel, ExecutivePanel, ForecastAlertsPanel, ForecastList } from '@/components/forecasts/panels';
import { CreateForecastForm, RecomputeCalibrationButton } from '@/components/forecasts/ForecastControls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ForecastValidationPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Forecast Validation" subtitle="Forecast validation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Forecast Validation is available to reviewers and admins.' : 'Sign in to view forecasts.'} redirectedFrom="/dashboard/forecast-validation" />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const d = await getForecastsDashboard();

  return (
    <DashboardPage
      title="Forecast Validation"
      subtitle="Record forecasts, track outcomes, and measure accuracy + calibration. Validation only — no AI predictions, no autonomous forecasts."
      actions={admin ? <RecomputeCalibrationButton /> : undefined}
    >
      <div className="space-y-8">
        <ForecastsOverview d={d} />
        <PerformancePanel p={d.performance} />
        <div className="grid gap-6 xl:grid-cols-2">
          <CalibrationPanel buckets={d.calibration} />
          <ReadinessPanel readiness={d.readiness} score={d.readinessScore} />
        </div>
        <ExecutivePanel d={d} />
        <ForecastAlertsPanel alerts={d.alerts} />
        {admin ? <CreateForecastForm /> : null}
        <ForecastList forecasts={d.recent} />
      </div>
    </DashboardPage>
  );
}
