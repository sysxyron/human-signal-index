// =============================================================================
// HSI Phase 64 — Evidence Graph (/dashboard/evidence-graph). Server Component,
// force-dynamic, reviewer+ (admins also rebuild). Graph overview + executive
// metrics + a server-paged relationship explorer (search → node inspector →
// neighbor navigation). All values computed; RLS-gated; no public access.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { hasRole } from '@/lib/security/rbac-audit';
import { isAdmin } from '@/lib/security/view';
import { ErrorState } from '@/components/signals/states';
import { DashboardPage } from '../../../components/dashboard-shell';
import { getEvidenceGraphDashboard } from '@/lib/evidence-graph/data';
import { getNodeSummary, searchNodes } from '@/lib/evidence-graph/service';
import {
  GraphOverview, GraphDistributions, ExecutiveGraphMetrics, SearchResults, NodeInspector,
} from '@/components/evidence-graph/panels';
import { GraphSearch, RebuildGraphButton } from '@/components/evidence-graph/GraphControls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EvidenceGraphPage({ searchParams }: { searchParams?: { node?: string; q?: string } }) {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !hasRole(role ?? undefined, 'reviewer')) {
    return (
      <>
        <TopNav title="Evidence Graph" subtitle="Connected intelligence" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState
            code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'}
            title="Insufficient permissions"
            message={user ? 'The Evidence Graph is available to reviewers and admins.' : 'Sign in to explore the evidence graph.'}
            redirectedFrom="/dashboard/evidence-graph"
          />
        </main>
      </>
    );
  }

  const admin = isAdmin(role);
  const nodeId = searchParams?.node;
  const q = searchParams?.q ?? '';

  const [dashboard, inspectorRes, results] = await Promise.all([
    getEvidenceGraphDashboard(),
    nodeId ? getNodeSummary(nodeId) : Promise.resolve(null),
    q ? searchNodes(q) : Promise.resolve(null),
  ]);
  const inspector = inspectorRes && inspectorRes.ok ? inspectorRes.data : null;
  const searchResults = results && results.ok ? results.data : [];

  return (
    <DashboardPage
      title="Evidence Graph"
      subtitle="Connected intelligence — sources, signals, evidence, reports, corrections & watchlists, with provenance on every edge"
      actions={admin ? <RebuildGraphButton /> : undefined}
    >
      <div className="space-y-8">
        <ExecutiveGraphMetrics d={dashboard} />
        <GraphOverview d={dashboard} />
        <GraphDistributions d={dashboard} />

        <div className="space-y-4">
          <h2 className="text-h6 font-semibold text-text-primary">Relationship explorer</h2>
          <GraphSearch initialQuery={q} />
          <SearchResults results={searchResults} />
          {inspector ? (
            <NodeInspector node={inspector.node} summary={inspector.summary} neighbors={inspector.neighbors} />
          ) : (
            <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">
              Search for a node above, or pick a top entity, to inspect its connected evidence, supporting/contradicting links, and provenance.
            </p>
          )}
        </div>
      </div>
    </DashboardPage>
  );
}
