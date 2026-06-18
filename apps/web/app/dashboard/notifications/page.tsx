// =============================================================================
// HSI Phase 62 — Notifications & Alerting (/dashboard/notifications). Server
// Component, force-dynamic. Available to ANY signed-in user (viewer+): their own
// notifications, severity breakdown, and preferences. Admins additionally see the
// platform-wide Executive Alerts summary + a pipeline test control. All counts
// are computed by the engine (no hardcoded values). RLS is the real boundary.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import {
  getNotifications, getUnreadCount, getNotificationStats, getPreferences, getExecutiveAlerts,
} from '@/lib/notifications/service';
import { NotificationSummary, SeverityBreakdown, ExecutiveAlertsPanel } from '@/components/notifications/panels';
import { NotificationList } from '@/components/notifications/NotificationList';
import { PreferencesForm } from '@/components/notifications/PreferencesForm';
import { SendTestAlertButton } from '@/components/notifications/SendTestAlertButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function NotificationsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user) {
    return (
      <>
        <TopNav title="Notifications" subtitle="Operational alerts" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code="AUTH_REQUIRED" title="Sign in required" message="Sign in to view your notifications." redirectedFrom="/dashboard/notifications" />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const [listRes, unread, stats, prefs, exec] = await Promise.all([
    getNotifications({ limit: 200 }),
    getUnreadCount(),
    getNotificationStats('self'),
    getPreferences(),
    admin ? getExecutiveAlerts() : Promise.resolve(null),
  ]);
  const items = listRes.ok ? listRes.data : [];

  return (
    <DashboardPage
      title="Notifications"
      subtitle="Operational intelligence alerts — source, review, publication, forecast, and system events"
      actions={admin ? <SendTestAlertButton /> : undefined}
    >
      <div className="space-y-8">
        {admin && exec ? <ExecutiveAlertsPanel summary={exec} /> : null}

        <NotificationSummary stats={stats} unread={unread} />

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2"><NotificationList items={items} /></div>
          <SeverityBreakdown stats={stats} />
        </div>

        <PreferencesForm initial={prefs} />
      </div>
    </DashboardPage>
  );
}
