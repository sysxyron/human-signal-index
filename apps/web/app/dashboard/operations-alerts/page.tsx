// =============================================================================
// HSI Phase 24 — Operational Alerts (/dashboard/operations-alerts). Server
// Component, force-dynamic, researcher+. Advisory alerts only — overdue work,
// stalled publications, escalations pending, workload imbalance, human review
// required. Alerts never act. Offline → labeled demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Bell, Info } from 'lucide-react';
import type { OperationsAlertsData } from '@hsi/shared-types';
import { getOperationsAlertsAction } from '@/lib/operations-os/actions';
import { demoOperationsAlerts } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { AlertList } from '@/components/operations-os/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OperationsAlertsPage() {
  const res = await getOperationsAlertsAction();
  let data: OperationsAlertsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;
  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') { data = demoOperationsAlerts(); isDemo = true; }
  else errored = { message: res.error, code: res.code };

  return (
    <>
      <TopNav title="Operational Alerts" subtitle="Advisory signals about work that needs attention — never automatic actions" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Bell className="h-5 w-5 text-electric" /> Alerts</h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}
        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">Every alert is <span className="font-semibold text-text-primary">advisory</span> — it flags and prioritizes for a human; it never publishes, approves, or escalates on its own.</p>
        </Card>

        {errored ? (
          <ErrorState title="Could not load alerts" message={errored.message} code={errored.code} redirectedFrom="/dashboard/operations-alerts" />
        ) : !data ? null : (
          <AlertList alerts={data.alerts} />
        )}
      </main>
    </>
  );
}
