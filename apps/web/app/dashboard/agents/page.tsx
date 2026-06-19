// =============================================================================
// HSI Phase 66 — Agents (/dashboard/agents). Server Component, force-dynamic,
// reviewer+ (admins run/schedule). Registered agents, health, runs, alerts, and
// execution metrics. Agents automate analysis only — no publishing, review, or
// moderation. RLS-gated.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getAgentsDashboard } from '@/lib/agents/data';
import { AgentsOverview, AgentGrid, AgentRunsTable, AgentAlertsPanel } from '@/components/agents/panels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AgentsPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Agents" subtitle="Agent automation" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'Agent Automation is available to reviewers and admins.' : 'Sign in to view agents.'} redirectedFrom="/dashboard/agents" />
        </main>
      </>
    );
  }

  const d = await getAgentsDashboard();

  return (
    <DashboardPage
      title="Agent Automation"
      subtitle="Explainable intelligence assistants — deterministic, auditable, human-reviewable. Agents never publish, review, or moderate."
    >
      <div className="space-y-8">
        <AgentsOverview totals={d.totals} />
        <div className="space-y-4">
          <h2 className="text-h6 font-semibold text-text-primary">Registered agents</h2>
          <AgentGrid items={d.agents} />
        </div>
        <AgentRunsTable runs={d.recentRuns} />
        <AgentAlertsPanel alerts={d.alerts} />
      </div>
    </DashboardPage>
  );
}
