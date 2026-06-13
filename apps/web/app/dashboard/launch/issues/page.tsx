// =============================================================================
// HSI Phase 23 — Beta Issues (/dashboard/launch/issues). Server Component. Open to
// ANY signed-in tester (every role). Renders the BETA ISSUE SYSTEM reporter (a
// governed placeholder — acknowledges, never auto-files/auto-acts) and a sample
// issue log. Nothing here changes governance.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { Bug, Info } from 'lucide-react';
import { IssueReportForm } from '@/components/launch/IssueReportForm';
import { IssueList } from '@/components/launch/IssueList';
import { demoBetaIssues } from '@/lib/launch/view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function BetaIssuesPage() {
  const issues = demoBetaIssues();
  return (
    <>
      <TopNav title="Beta Issues" subtitle="Report and track beta findings — human-reviewed, never auto-actioned" />
      <main className="space-y-6 p-5 lg:p-6">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Bug className="h-5 w-5 text-electric" /> Beta issue system</h2>
        </div>

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            This is the <span className="font-semibold text-text-primary">BETA ISSUE SYSTEM</span>. Submitting a report
            acknowledges it for human triage — it is not persisted to a tracker in this build and triggers no automated action.
            For critical security findings, contact the team directly rather than filing here.
          </p>
        </Card>

        <IssueReportForm />

        <section className="space-y-3">
          <h3 className="text-h6 font-semibold text-text-primary">Recent beta issues (sample)</h3>
          <IssueList issues={issues} />
        </section>
      </main>
    </>
  );
}
