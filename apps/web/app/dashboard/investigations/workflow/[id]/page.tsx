// =============================================================================
// HSI Phase 25 — Investigation Workflow detail (/dashboard/investigations/
// workflow/[id]). Server Component, force-dynamic, researcher+. Shows summary,
// status, priority, owner, team, the publication-readiness checklist (read-only),
// the append-only timeline, and role-aware workflow actions. Offline → demo.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle, Clock } from 'lucide-react';
import { getInvestigationWorkflowAction } from '@/lib/contributor/investigations';
import { WorkflowActions } from '@/components/contributor/WorkflowActions';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PRIORITY_COLOR: Record<string, string> = { low: '#94A3B8', medium: '#38BDF8', high: '#F59E0B', critical: '#EF4444' };

export default async function InvestigationWorkflowPage({ params }: { params: { id: string } }) {
  const res = await getInvestigationWorkflowAction(params.id);
  if (!res.ok) {
    return (
      <>
        <TopNav title="Investigation" subtitle="Workflow detail" />
        <main className="space-y-6 p-5 lg:p-6">
          <ErrorState code={res.code === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} title="Could not load investigation" message={res.code === 'FORBIDDEN' ? 'Investigations are restricted to researchers and above.' : 'This investigation is unavailable.'} redirectedFrom={`/dashboard/investigations/workflow/${params.id}`} />
        </main>
      </>
    );
  }
  const { investigation: inv, timeline, readinessChecklist: checklist, publicationReady, canAct, role } = res.data;

  return (
    <>
      <TopNav title={inv.title} subtitle="Investigation workflow" />
      <main className="space-y-6 p-5 lg:p-6">
        {res.demo ? <OfflineDemoBanner /> : null}
        <Link href={"/dashboard/investigations" as never} className="inline-flex items-center gap-1.5 text-caption text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Back to investigations</Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="space-y-3 border-border" padded>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-label font-medium capitalize text-text-secondary">{inv.status.replace(/_/g, ' ')}</span>
                <span className="rounded-full px-2.5 py-0.5 text-label font-semibold capitalize" style={{ backgroundColor: `${PRIORITY_COLOR[inv.priority]}1f`, color: PRIORITY_COLOR[inv.priority] }}>{inv.priority}</span>
              </div>
              {inv.summary ? <p className="text-caption leading-relaxed text-text-secondary">{inv.summary}</p> : null}
              <dl className="grid grid-cols-2 gap-3 text-caption sm:grid-cols-4">
                <div><dt className="text-label uppercase text-text-muted">Owner</dt><dd className="text-text-primary">{inv.ownerId ? 'Assigned' : 'Unassigned'}</dd></div>
                <div><dt className="text-label uppercase text-text-muted">Team</dt><dd className="text-text-primary">{inv.teamId ?? '—'}</dd></div>
                <div><dt className="text-label uppercase text-text-muted">Events</dt><dd className="text-text-primary">{timeline.length}</dd></div>
                <div><dt className="text-label uppercase text-text-muted">Ready</dt><dd className={publicationReady ? 'text-success' : 'text-text-muted'}>{publicationReady ? 'Yes' : 'Not yet'}</dd></div>
              </dl>
            </Card>

            {/* Timeline (append-only) */}
            <Card className="space-y-3 border-border" padded>
              <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Clock className="h-4 w-4 text-electric" /> Timeline</h3>
              <ol className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-3 border-l-2 border-border pl-3">
                    <div className="min-w-0">
                      <p className="text-caption font-medium text-text-primary">{e.action.replace(/_/g, ' ').replace(/:/g, ' · ')}</p>
                      {e.reason ? <p className="text-caption text-text-secondary">{e.reason}</p> : null}
                      <p className="text-label text-text-muted">{new Date(e.createdAt).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
                {timeline.length === 0 ? <li className="text-caption text-text-muted">No events recorded yet.</li> : null}
              </ol>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Publication readiness (read-only) */}
            <Card className="space-y-2 border-border" padded>
              <h3 className="text-h6 font-semibold text-text-primary">Publication readiness</h3>
              <p className="text-label text-text-muted">Read-only — publishing stays governed by the publication workflows.</p>
              <ul className="space-y-1.5 pt-1">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-caption">
                    {c.ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-text-muted" />}
                    <span className={c.ok ? 'text-text-primary' : 'text-text-secondary'}>{c.label}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {canAct ? <WorkflowActions id={inv.id} status={inv.status} role={role} /> : null}
          </div>
        </div>
      </main>
    </>
  );
}
