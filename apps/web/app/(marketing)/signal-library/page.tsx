import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { getSignalLibraryData } from '@/lib/public-intelligence';
import { SignalExplorer } from '@/components/signal-library/SignalExplorer';
import { TrendAnalytics } from '@/components/signal-library/TrendAnalytics';

export const metadata: Metadata = {
  title: 'Signal Library',
  description:
    'Explore a public, traceable catalog of analyzed narratives — search, filter by category, risk and status, and inspect the evidence chain behind each signal.',
  alternates: { canonical: '/signal-library' },
};

// Live public data, cached at the data layer (60–120s). ISR keeps the shell fast.
export const revalidate = 120;

export default async function SignalLibraryPage() {
  const data = await getSignalLibraryData();

  return (
    <>
      <PageHeader
        eyebrow="Signal Library"
        title="Explore traceable public intelligence."
        description="A live, public catalog of analyzed narratives. Search and filter by category, risk, and status — then open any signal to inspect its evidence chain, traceability score, and human-review status."
      />

      <Section>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-h5 font-semibold text-text-primary">Intelligence overview</h2>
          <span className="text-caption text-text-muted">{data.total} public {data.total === 1 ? 'record' : 'records'}</span>
        </div>
        <TrendAnalytics trends={data.trends} />
      </Section>

      <Section className="pt-0">
        <SignalExplorer data={data} />
      </Section>
    </>
  );
}
