// =============================================================================
// HSI Phase 41B — Signal Submission queue (/dashboard/signal-submission).
// Reviewer+/admin. Surfaces public/viewer submissions so they are NEVER orphaned
// (beta bug G). Read path: listSignalSubmissions (RLS reviewer+/admin).
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Inbox } from 'lucide-react';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canReview } from '@/lib/signals/view';
import { IntelNav } from '@/components/signals/IntelNav';
import { SubmissionStatusSelect } from '@/components/signals/SubmissionStatusSelect';
import { classifyReferenceUrl, referenceKindLabel } from '@/lib/signals/reference-url';
import { listSignalSubmissionsAction } from '@/lib/signals/submission-actions';
import { ErrorState, OfflineDemoBanner, EmptyState } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SignalSubmissionPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !canReview(role)) {
    return (
      <><TopNav title="Signal Submissions" subtitle="Reviewer / admin only" />
        <main className="space-y-6 p-5 lg:p-6"><IntelNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions"
            message={user ? 'The submission queue is restricted to reviewers and admins.' : 'Sign in to continue.'}
            redirectedFrom="/dashboard/signal-submission" />
        </main></>
    );
  }

  const res = await listSignalSubmissionsAction();
  const isDemo = !res.ok && res.code === 'NOT_CONFIGURED';
  const submissions = res.ok ? res.data : [];

  return (
    <>
      <TopNav title="Signal Submissions" subtitle="Public / viewer submissions awaiting review" />
      <main className="space-y-6 p-5 lg:p-6">
        <IntelNav />
        {isDemo ? <OfflineDemoBanner /> : null}
        {!res.ok && !isDemo ? (
          <ErrorState title="Could not load submissions" message={res.error} code={res.code === 'FORBIDDEN' ? 'FORBIDDEN' : undefined} />
        ) : submissions.length === 0 ? (
          <EmptyState icon={<Inbox className="h-5 w-5" />} title="No submissions yet" message="Signals submitted via the public form appear here for review." />
        ) : (
          <Card className="overflow-x-auto p-0" padded={false}>
            <table className="w-full text-caption">
              <thead className="border-b border-border bg-surface/50 text-label uppercase tracking-wide text-text-muted">
                <tr><th className="px-4 py-2.5 text-left">Observation</th><th className="px-4 py-2.5 text-left">Reference</th><th className="px-4 py-2.5 text-left">Platform / Category</th><th className="px-4 py-2.5 text-left">Status</th><th className="px-4 py-2.5 text-left">Triage</th><th className="px-4 py-2.5 text-left">Submitted</th></tr>
              </thead>
              <tbody>
                {submissions.map((s) => {
                  const ref = s.source_url ? classifyReferenceUrl(s.source_url) : null;
                  return (
                    <tr key={s.id} className="border-b border-border/50 align-top last:border-0">
                      <td className="px-4 py-2.5 text-text-primary">
                        {s.observation.slice(0, 200)}
                        {s.evidence_path ? <p className="mt-0.5 text-caption text-verified">Attachment stored</p> : null}
                        {s.notes ? <p className="mt-0.5 text-caption text-text-muted">{s.notes.slice(0, 160)}</p> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.source_url ? (
                          <a href={s.source_url} target="_blank" rel="noreferrer" className="text-electric hover:text-white">
                            {ref ? referenceKindLabel(ref.kind) : 'link'} ↗
                          </a>
                        ) : <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{[s.platform, s.category].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-2.5 capitalize text-text-secondary">{s.status}</td>
                      <td className="px-4 py-2.5"><SubmissionStatusSelect id={s.id} current={s.status} /></td>
                      <td className="px-4 py-2.5 text-text-muted">{s.created_at?.slice(0, 10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
