import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { CmsBlocks as CmsBlocksView } from '@/components/cms/CmsBlocks';
import { getSignalLibraryData, getPublicActivityFeed } from '@/lib/public-intelligence';
import { ReportsExplorer } from '@/components/research-reports/ReportsExplorer';
import { NarrativeMap } from '@/components/research-reports/NarrativeMap';
import { ReportActivityFeed } from '@/components/research-reports/ReportActivityFeed';
import { TrustStrip } from '@/components/research-reports/TrustStrip';

export const metadata: Metadata = {
  title: 'Research Reports',
  description:
    'Finished, human-reviewed intelligence products from Human Signal Index. Search and filter reports, inspect the evidence chain, traceability, and review status behind every finding.',
  alternates: { canonical: '/research-reports' },
};

export default async function ResearchReportsPage() {
  // CMS-first behavior preserved: if an editor has published a CMS page for this
  // route, render it unchanged. Otherwise render the live Intelligence Center.
  const cms = await cmsGet('research-reports');
  if (cms) return <CmsBlocksView blocks={cms.blocks} />;

  const [data, activity] = await Promise.all([getSignalLibraryData(), getPublicActivityFeed()]);

  return (
    <>
      <PageHeader
        eyebrow="Research Reports"
        title="Finished intelligence, published for the public."
        description="In-depth, human-reviewed research products. Every conclusion traces back to a verifiable evidence chain — search, filter, and inspect the intelligence behind each report."
      />

      <Section>
        <TrustStrip />
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <NarrativeMap activity={data.categoryActivity} />
          <ReportActivityFeed items={activity} />
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-5 text-h5 font-semibold text-text-primary">All reports</h2>
        <ReportsExplorer data={data} />
      </Section>
    </>
  );
}
