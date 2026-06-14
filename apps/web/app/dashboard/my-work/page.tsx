// =============================================================================
// HSI Phase 24 — My Work Queue (/dashboard/my-work). Server Component,
// force-dynamic, researcher+. The signed-in user's personal queue: assigned,
// awaiting review, needs evidence, needs approval, escalated, completed.
// Read-only. Renders a labeled sample where live assignment data isn't present.
// =============================================================================

import { TopNav } from '@hsi/ui';
import { ClipboardList } from 'lucide-react';
import { getSessionRole, getUser } from '@/lib/supabase/server';
import { canResearch, demoMyWork } from '@/lib/operations-os/view';
import { OperationsNav } from '@/components/operations-os/OperationsNav';
import { CaseList } from '@/components/operations-os/panels';
import { DemoBadge } from '@/components/signals/badges';
import { ErrorState, OfflineDemoBanner } from '@/components/signals/states';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyWorkPage() {
  const [role, user] = await Promise.all([getSessionRole(), getUser()]);
  if (!user || !canResearch(role)) {
    return (
      <>
        <TopNav title="My Work" subtitle="Your personal work queue" />
        <main className="space-y-6 p-5 lg:p-6">
          <OperationsNav />
          <ErrorState code={user ? 'FORBIDDEN' : 'AUTH_REQUIRED'} title="Insufficient permissions" message={user ? 'My Work is available to the researcher role or above.' : 'Sign in to view your work queue.'} redirectedFrom="/dashboard/my-work" />
        </main>
      </>
    );
  }

  const data = demoMyWork(user.email?.split('@')[0] ?? 'alice');

  return (
    <>
      <TopNav title="My Work" subtitle="Everything assigned to you, grouped by what it needs next" />
      <main className="space-y-6 p-5 lg:p-6">
        <OperationsNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><ClipboardList className="h-5 w-5 text-electric" /> My queue</h2>
          <DemoBadge />
        </div>
        <OfflineDemoBanner message="Showing a labeled sample queue. Live assignments appear here once cases are assigned to you." />

        <Section title="Assigned to me"><CaseList cases={data.assignedToMe} emptyMessage="Nothing assigned to you." /></Section>
        <Section title="Awaiting review"><CaseList cases={data.awaitingReview} emptyMessage="Nothing awaiting review." /></Section>
        <Section title="Needs evidence"><CaseList cases={data.needsEvidence} emptyMessage="Nothing needs evidence." /></Section>
        <Section title="Needs approval"><CaseList cases={data.needsApproval} emptyMessage="Nothing needs approval." /></Section>
        <Section title="Escalated"><CaseList cases={data.escalated} emptyMessage="No escalated items." /></Section>
        <Section title="Completed"><CaseList cases={data.completed} emptyMessage="No completed items yet." /></Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">{title}</h3>
      {children}
    </section>
  );
}
