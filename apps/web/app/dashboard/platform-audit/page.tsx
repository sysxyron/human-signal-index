// =============================================================================
// HSI Phase 73.2 — Platform Self-Check Auditor (/dashboard/platform-audit).
// Server Component, force-dynamic, ADMIN-ONLY. Runs deterministic quality checks
// across routing, RBAC, environment, infrastructure, migrations, and the
// conversion funnel, and presents a structured, PDF-ready report. Read-only;
// real results only; checks that cannot run are NOT_OBSERVED / NOT_CONFIGURED.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getPlatformAuditReport } from '@/lib/platform-audit/data';
import { getRuntimeStatus } from '@/lib/operations-runtime/data';
import { AuditSummaryPanel, RecommendedActions, ReportTables } from '@/components/platform-audit/panels';
import { OperationsCenter } from '@/components/operations-runtime/panels';
import { PdfExportButton } from '@/components/platform-audit/PdfExportButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PlatformAuditPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !isAdmin(role)) {
    return (
      <>
        <TopNav title="Platform Audit" subtitle="Platform self-check & quality auditor" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'The Platform Auditor is available to administrators.' : 'Sign in to run the platform audit.'} redirectedFrom="/dashboard/platform-audit" />
        </main>
      </>
    );
  }

  const [report, runtimeStatus] = await Promise.all([getPlatformAuditReport(), getRuntimeStatus()]);

  return (
    <DashboardPage
      title="Platform Self-Check"
      subtitle="Deterministic quality checks across routing, RBAC, environment, infrastructure, migrations, and conversion. Real results only — checks that cannot run are marked NOT_OBSERVED."
      actions={<PdfExportButton />}
    >
      <div className="space-y-8">
        <AuditSummaryPanel r={report} />
        <RecommendedActions r={report} />
        <OperationsCenter status={runtimeStatus} />
        <ReportTables r={report} />
      </div>
    </DashboardPage>
  );
}
