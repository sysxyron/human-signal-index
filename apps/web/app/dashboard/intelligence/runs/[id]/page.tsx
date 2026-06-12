// =============================================================================
// HSI Phase 18 — Research Run Replay (/dashboard/intelligence/runs/[id]). Server
// Component, force-dynamic. getResearchRunReplayAction(id) returns the run, its
// FULL audited event timeline (RunReplayTimeline), the agent tasks + assignments,
// any escalations, and pipeline progress. "Replay the entire intelligence process
// — nothing hidden." Researcher+ view.
//
// Offline (NOT_CONFIGURED) → labeled demo.
// =============================================================================

import Link from 'next/link';
import { TopNav, Card } from '@hsi/ui';
import { ArrowLeft, GitBranch, Users } from 'lucide-react';
import type { ResearchRunReplayData } from '@hsi/shared-types';
import { getResearchRunReplayAction } from '@/lib/orchestration/actions';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import {
  agentLabel,
  canResearch,
  demoResearchRunReplay,
  formatPct,
  formatProgress,
  formatRuntime,
  formatTrust,
} from '@/lib/orchestration/view';
import { IntelligenceOpsNav } from '@/components/intelligence/IntelligenceOpsNav';
import { RunReplayTimeline } from '@/components/intelligence/RunReplayTimeline';
import { PriorityBadge, RunStateBadge, TaskStateBadge } from '@/components/intelligence/badges';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner, type DbErrorCode } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RunReplayPage({ params }: { params: { id: string } }) {
  const [res, role, user] = await Promise.all([
    getResearchRunReplayAction(params.id),
    getSessionRole(),
    getUser(),
  ]);
  const mayView = canResearch(role) && Boolean(user);

  let data: ResearchRunReplayData | null = null;
  let isDemo = false;
  let errored: { message: string; code?: DbErrorCode } | null = null;

  if (res.ok) data = res.data;
  else if (res.code === 'NOT_CONFIGURED') {
    data = demoResearchRunReplay(params.id);
    isDemo = true;
  } else errored = { message: res.error, code: res.code };

  const forbidden = !isDemo && res.ok && !mayView;
  const run = data?.run;

  return (
    <>
      <TopNav title="Run replay" subtitle="How did this conclusion emerge? — replay the entire intelligence process" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelligenceOpsNav />
        <Link href={'/dashboard/intelligence/runs' as never} className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to runs
        </Link>
        {isDemo ? <OfflineDemoBanner /> : null}

        {forbidden ? (
          <ErrorState title="Insufficient permissions" message="Viewing a run requires the researcher role or above." code="FORBIDDEN" />
        ) : errored ? (
          <ErrorState title="Could not load the run" message={errored.message} code={errored.code} redirectedFrom={`/dashboard/intelligence/runs/${params.id}`} />
        ) : !data || !run ? (
          <ErrorState title="Run not found" message="This research run does not exist." />
        ) : (
          <div className="space-y-6">
            {/* Header card */}
            <Card className="space-y-3 border-border" padded>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-electric" />
                  <h2 className="text-h6 font-semibold text-text-primary">{run.title ?? run.id}</h2>
                  {isDemo ? <DemoBadge /> : null}
                </div>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={run.priority} />
                  <RunStateBadge state={run.state} />
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-electric" style={{ width: formatProgress(data.progress) }} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-caption sm:grid-cols-4">
                <Metric label="Workflow" value={run.workflow_key ?? '—'} />
                <Metric label="Evidence" value={String(run.evidence_count ?? 0)} />
                <Metric label="Confidence" value={formatPct(run.confidence)} />
                <Metric label="Trust" value={formatTrust(run.trust_score)} />
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Replay timeline */}
              <Card className="space-y-3 border-border" padded>
                <h3 className="text-h6 font-semibold text-text-primary">Intelligence process</h3>
                <RunReplayTimeline events={data.events} />
              </Card>

              {/* Tasks + escalations */}
              <div className="space-y-6">
                <Card className="space-y-3 border-border" padded>
                  <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary">
                    <Users className="h-4 w-4 text-electric" /> Agents involved
                  </h3>
                  {data.tasks.length === 0 ? (
                    <p className="text-caption text-text-muted">No agent tasks recorded.</p>
                  ) : (
                    <table className="w-full text-caption">
                      <tbody>
                        {data.tasks.map((t) => (
                          <tr key={t.id} className="border-b border-border/40 last:border-0">
                            <td className="py-1.5 text-text-secondary">{agentLabel(t.agent_type)}</td>
                            <td className="py-1.5 text-text-muted">{t.stage}</td>
                            <td className="py-1.5 text-right tabular-nums text-text-muted">{formatRuntime(t.runtime_ms)}</td>
                            <td className="py-1.5 pl-3 text-right"><TaskStateBadge state={t.state} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>

                {data.escalations.length > 0 ? (
                  <Card className="space-y-3 border-border" padded>
                    <h3 className="text-h6 font-semibold text-text-primary">Escalations</h3>
                    <ul className="space-y-2">
                      {data.escalations.map((e) => (
                        <li key={e.id} className="rounded-card border border-border bg-surface/50 p-2 text-caption text-text-secondary">
                          <span className="font-semibold text-text-primary">{e.trigger}</span> — {e.reason}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-surface/50 px-3 py-2">
      <div className="text-label uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 font-semibold text-text-primary">{value}</div>
    </div>
  );
}
