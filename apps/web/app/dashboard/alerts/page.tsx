// =============================================================================
// HSI Phase 7 — Alert Center (/dashboard/alerts). Server Component.
// Explainable alerts (alert type, severity, status, related signal/source) with
// per-alert View / Acknowledge / Escalate / Create-Research actions and
// severity/status/type filters. EVERY alert shows its explanation — no
// black-box conclusions. Offline (NOT_CONFIGURED) → labeled demo. force-dynamic.
// =============================================================================

import Link from 'next/link';
import { TopNav } from '@hsi/ui';
import { Bell } from 'lucide-react';
import type { HsinSignalAlertRecord } from '@hsi/shared-types';
import { listAlertsAction } from '@/lib/signals/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canReview, demoAlerts } from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { AlertTable } from '@/components/signals/AlertTable';
import { SlaBadge } from '@/components/operations/SlaBadge';
import { DemoBadge } from '@/components/signals/badges';
import {
  ErrorState,
  OfflineDemoBanner,
  type DbErrorCode,
} from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AlertsPage() {
  const [res, role, user] = await Promise.all([
    listAlertsAction(),
    getSessionRole(),
    getUser(),
  ]);

  const canAct = canReview(role) && Boolean(user);

  let alerts: HsinSignalAlertRecord[] = [];
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) {
    alerts = res.data;
  } else if (res.code === 'NOT_CONFIGURED') {
    alerts = demoAlerts();
    isDemo = true;
  } else {
    errored = { message: res.error, code: res.code };
  }

  return (
    <>
      <TopNav title="Alert Center" subtitle="Explainable alerts for human review" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
              <Bell className="h-5 w-5 text-electric" /> Alerts
            </h2>
            {isDemo ? <DemoBadge /> : null}
          </div>
        </div>

        <p className="text-caption text-text-muted">
          Alerts are raised by the network as drafts. They are never auto-actioned
          — a human acknowledges, escalates, or opens research. Every alert carries
          an explanation.
        </p>

        {/* ADDITIVE (Phase 8): SLA state legend — alert review deadlines map to
            these states (full SLA tracking lives in the operations console). */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label text-text-muted">SLA states:</span>
          <SlaBadge state="on_track" />
          <SlaBadge state="due_soon" />
          <SlaBadge state="overdue_review" />
          <SlaBadge state="overdue_escalation" />
          <Link
            href={'/dashboard/operations' as never}
            className="ml-1 inline-flex items-center gap-1 text-caption font-semibold text-electric hover:underline"
          >
            Operations console
          </Link>
        </div>

        {isDemo ? <OfflineDemoBanner /> : null}

        {errored ? (
          <ErrorState
            title="Could not load alerts"
            message={errored.message}
            code={errored.code}
            redirectedFrom="/dashboard/alerts"
          />
        ) : (
          <AlertTable alerts={alerts} canAct={canAct} demo={isDemo} />
        )}
      </main>
    </>
  );
}
