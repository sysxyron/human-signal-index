// =============================================================================
// HSI Phase 66 — Agent detail (/dashboard/agents/[id]). Server Component, force-
// dynamic, reviewer+ (admins run/schedule/cancel). Summary, runs, findings, and
// alerts for one agent. [id] = agent_key. RLS-gated.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../../components/dashboard-shell';
import { getAgent, getAgentMetrics, getAgentRuns, getAgentResults, getAgentAlerts } from '@/lib/agents/service';
import { AgentSummaryPanel, AgentRunsTable, AgentFindingsPanel, AgentAlertsPanel } from '@/components/agents/panels';
import { AgentControls } from '@/components/agents/AgentControls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Agent" subtitle="Agent automation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Restricted to reviewers and admins.' : 'Sign in to continue.'} redirectedFrom={`/dashboard/agents/${params.id}`} />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const [agentRes, metricsRes, runsRes, resultsRes, alertsRes] = await Promise.all([
    getAgent(params.id), getAgentMetrics(params.id), getAgentRuns(params.id, 30), getAgentResults(params.id, 60), getAgentAlerts(params.id, 30),
  ]);

  if (!agentRes.ok) {
    return (
      <>
        <TopNav title="Agent" subtitle="Agent automation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code="DB_ERROR" title="Agent not found" message={agentRes.error} redirectedFrom="/dashboard/agents" />
        </main>
      </>
    );
  }

  const agent = agentRes.data;
  const metrics = metricsRes.ok ? metricsRes.data : null;
  const runs = runsRes.ok ? runsRes.data : [];
  const results = resultsRes.ok ? resultsRes.data : [];
  const alerts = alertsRes.ok ? alertsRes.data : [];

  return (
    <DashboardPage
      title={agent.name}
      subtitle={`Consumes: ${agent.category ?? 'intelligence'} · deterministic, auditable, human-reviewable`}
      actions={admin ? <AgentControls agentKey={agent.agentKey} cadence={agent.cadence} /> : undefined}
    >
      <div className="space-y-8">
        <AgentSummaryPanel agent={agent} metrics={metrics} />
        <AgentFindingsPanel results={results} />
        <div className="grid gap-6 xl:grid-cols-2">
          <AgentRunsTable runs={runs} />
          <AgentAlertsPanel alerts={alerts} />
        </div>
      </div>
    </DashboardPage>
  );
}
