// =============================================================================
// HSI Phase 18 — Research Runs (/dashboard/intelligence/runs). Server Component,
// force-dynamic. getResearchRunsAction(state?) lists every research run with its
// state, priority, assigned agents, evidence count, confidence, trust score, and
// outcome status. Filter by state via ?state=. Each run links to its replay.
// Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ListTree } from 'lucide-react';
import type { ResearchRunsData, ResearchRunState } from '@hsi/shared-types';
import { getResearchRunsAction } from '@/lib/orchestration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  canResearch,
  demoResearchRuns,
  formatPct,
  formatTrust,
  readStringArray,
} from '@/lib/orchestration/view';
import { IntelligenceOpsNav } from '@/components/intelligence/IntelligenceOpsNav';
import { PriorityBadge, RunStateBadge } from '@/components/intelligence/badges';
import { DemoBadge } from '@/components/signals/badges';
import { EmptyState, ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATES: ResearchRunState[] = [
  'CREATED', 'QUEUED', 'DISCOVERING', 'EVIDENCING', 'DECISION', 'TRUST',
  'GOVERNANCE', 'COMPLETE', 'FAILED', 'ESCALATED',
];

function isState(v: string | undefined): v is ResearchRunState {
  return Boolean(v) && STATES.includes(v as ResearchRunState);
}

export default async function RunsPage({ searchParams }: { searchParams: { state?: string } }) {
  const stateFilter = isState(searchParams.state) ? searchParams.state : undefined;
  const [res, role, user] = await Promise.all([
    getResearchRunsAction(stateFilter),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ResearchRunsData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoResearchRuns();
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const runs = data?.runs ?? [];

  return (
    <>
      <TopNav title="Research runs" subtitle="What research is running, queued, completed, failed, or escalated?" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelligenceOpsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <ListTree className="h-5 w-5 text-electric" /> Runs
          </h2>
          {isDemo ? <DemoBadge /> : null}
        </div>
        {isDemo ? <OfflineDemoBanner /> : null}

        {data ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={'/dashboard/intelligence/runs' as never}
              className="rounded-full px-3 py-1 text-caption font-semibold transition"
              style={!stateFilter ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' } : { color: '#94A3B8', border: '1px solid #2A3A5C' }}
            >
              All {isDemo ? '' : `(${runs.length})`}
            </Link>
            {STATES.filter((s) => (data!.byState[s] ?? 0) > 0 || isDemo).map((s) => (
              <Link
                key={s}
                href={`/dashboard/intelligence/runs?state=${s}` as never}
                className="rounded-full px-3 py-1 text-caption font-semibold transition"
                style={stateFilter === s ? { backgroundColor: '#3B82F61f', color: '#3B82F6', border: '1px solid #3B82F655' } : { color: '#94A3B8', border: '1px solid #2A3A5C' }}
              >
                {s} {isDemo ? '' : `(${data!.byState[s] ?? 0})`}
              </Link>
            ))}
          </div>
        ) : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing runs requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load runs" message={errored.message} code={errored.code} redirectedFrom="/dashboard/intelligence/runs" />
        ) : !data ? null : runs.length === 0 ? (
          <EmptyState icon={<ListTree className="h-5 w-5" />} title="No research runs" message="Start a run from the operations center, or accept a discovered opportunity." />
        ) : (
          <Card className="overflow-x-auto border-border" padded={false}>
            <table className="w-full text-caption">
              <thead>
                <tr className="border-b border-border text-left text-label uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5 font-medium">Run</th>
                  <th className="px-4 py-2.5 font-medium">State</th>
                  <th className="px-4 py-2.5 font-medium">Priority</th>
                  <th className="px-4 py-2.5 font-medium">Agents</th>
                  <th className="px-4 py-2.5 font-medium">Evidence</th>
                  <th className="px-4 py-2.5 font-medium">Confidence</th>
                  <th className="px-4 py-2.5 font-medium">Trust</th>
                  <th className="px-4 py-2.5 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 transition hover:bg-surface-2/50">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/intelligence/runs/${r.id}` as never} className="font-medium text-text-primary hover:underline">
                        {r.title ?? r.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><RunStateBadge state={r.state} /></td>
                    <td className="px-4 py-2.5"><PriorityBadge priority={r.priority} /></td>
                    <td className="px-4 py-2.5 tabular-nums text-text-muted">{readStringArray(r.assigned_agents).length || '—'}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">{r.evidence_count ?? 0}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatPct(r.confidence)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-text-secondary">{formatTrust(r.trust_score)}</td>
                    <td className="px-4 py-2.5 text-text-muted">{r.outcome_status ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
