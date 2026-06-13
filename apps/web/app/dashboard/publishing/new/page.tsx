// =============================================================================
// HSI Phase 19 / Post-V1 — New Report (/dashboard/publishing/new). Server
// Component. The previously-missing destination for the "New report" / "Draft new
// report" CTAs. Renders a governed draft form (NewReportForm) that calls the
// existing createPublicationAction. Curator+ may create a draft; the action gates
// the role and returns a clear error otherwise.
//
// GOVERNANCE: reports remain DRAFTS until a human reviewer approves them. Nothing
// is auto-published.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import { FilePlus2, Info } from 'lucide-react';
import { PublishingNav } from '@/components/publishing/PublishingNav';
import { NewReportForm } from '@/components/publishing/NewReportForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function NewReportPage() {
  return (
    <>
      <TopNav title="New Report" subtitle="Draft a public, evidence-backed report — human-approved before it is ever published" />
      <main className="space-y-6 p-5 lg:p-6">
        <PublishingNav />
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <FilePlus2 className="h-5 w-5 text-electric" /> Draft a report
          </h2>
        </div>

        <Card className="flex items-start gap-2 border-border bg-surface/50" padded>
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-electric" />
          <p className="text-caption leading-relaxed text-text-secondary">
            Reports remain <span className="font-semibold text-text-primary">drafts until approved by a human reviewer</span>.
            Saving a draft places it in the review queue; it is never auto-published. Creating a draft requires the curator
            role or above.
          </p>
        </Card>

        <NewReportForm />
      </main>
    </>
  );
}
