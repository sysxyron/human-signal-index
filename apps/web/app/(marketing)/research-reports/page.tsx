import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import {
  Card,
  Table,
  CategoryTag,
  TraceabilityBadge,
  RiskBadge,
  type TableColumn,
  type RiskLevel,
  type CategoryTone,
} from '@hsi/ui';
import { ArrowUpRight, FileText, CheckCircle2 } from 'lucide-react';
import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { CmsBlocks as CmsBlocksView } from '@/components/cms/CmsBlocks';

export const metadata: Metadata = {
  title: 'Research Reports',
  description:
    'In-depth, human-reviewed research reports from Human Signal Index. Each report traces its conclusions to a verifiable evidence chain.',
  alternates: { canonical: '/research-reports' },
};

const CATEGORIES = [
  'Information Operations', 'Emerging Technologies', 'Public Trust',
  'Governance', 'Population Dynamics', 'Narrative Analysis',
];

interface FeaturedReport {
  title: string;
  summary: string;
  category: string;
  tone: CategoryTone;
  date: string;
  status: string;
  evidence: number;
  trace: number;
}

const featured: FeaturedReport[] = [
  { title: 'Quarterly Narrative Landscape Review', summary: 'A synthesis of the dominant narratives, emerging risks, and shifts in influence tactics over the quarter.', category: 'Narrative Analysis', tone: 'blue', date: 'Jun 2026', status: 'Published', evidence: 42, trace: 97 },
  { title: 'Recruitment Tactics Across Platforms', summary: 'How recruitment narratives adapt their rhetoric to the culture of each platform they appear on.', category: 'Information Operations', tone: 'orange', date: 'May 2026', status: 'Published', evidence: 31, trace: 94 },
  { title: 'Anatomy of a Health-Misinfo Cascade', summary: 'Tracing a single false claim from its origin to mass amplification, with the full evidence chain attached.', category: 'Public Trust', tone: 'red', date: 'Apr 2026', status: 'Published', evidence: 28, trace: 92 },
];

interface Row {
  id: string;
  title: string;
  category: string;
  tone: CategoryTone;
  risk: RiskLevel;
  trace: number;
  date: string;
}

const rows: Row[] = [
  { id: '1', title: 'Cross-border disinformation flows', category: 'Governance', tone: 'purple', risk: 4, trace: 90, date: 'Mar 2026' },
  { id: '2', title: 'Civic narratives during elections', category: 'Public Trust', tone: 'blue', risk: 3, trace: 95, date: 'Feb 2026' },
  { id: '3', title: 'Population dynamics and migration narratives', category: 'Population Dynamics', tone: 'orange', risk: 2, trace: 84, date: 'Jan 2026' },
  { id: '4', title: 'AI-generated persona networks', category: 'Emerging Technologies', tone: 'green', risk: 3, trace: 91, date: 'Jan 2026' },
];

const columns: TableColumn<Row>[] = [
  { key: 'title', header: 'Report', render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
  { key: 'category', header: 'Category', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'risk', header: 'Subject risk', render: (r) => <RiskBadge level={r.risk} /> },
  { key: 'trace', header: 'Traceability', render: (r) => <TraceabilityBadge score={r.trace} /> },
  { key: 'date', header: 'Published', align: 'right', render: (r) => r.date },
];

export default async function ResearchReportsPage() {
  const cms = await cmsGet('research-reports');
  if (cms) return <CmsBlocksView blocks={cms.blocks} />;
  return (
    <>
      <PageHeader
        eyebrow="Research Reports"
        title="Evidence-backed findings, published for the public."
        description="In-depth analyses of narratives and influence patterns. Every conclusion traces back to its source."
      />

      {/* Categories */}
      <Section>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <span key={c} className="rounded-full border border-border bg-surface-2/50 px-3 py-1 text-caption font-medium text-text-secondary">
              {c}
            </span>
          ))}
        </div>
      </Section>

      {/* Featured report cards */}
      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">Featured reports</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {featured.map((r) => (
            <Card key={r.title} interactive className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CategoryTag label={r.category} tone={r.tone} />
                <span className="inline-flex items-center gap-1 text-caption text-verified"><CheckCircle2 className="h-3.5 w-3.5" /> {r.status}</span>
              </div>
              <h3 className="text-h6 font-semibold text-text-primary">{r.title}</h3>
              <p className="text-body-sm text-text-secondary">{r.summary}</p>
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-caption text-text-muted">
                <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {r.evidence} evidence items</span>
                <span>{r.date}</span>
              </div>
              <a href="/intelligence" className="inline-flex w-fit items-center gap-1.5 rounded-btn border border-border bg-surface-2/60 px-3 py-1.5 text-caption font-semibold text-electric transition hover:border-electric hover:text-white">
                Read report <ArrowUpRight className="h-4 w-4" />
              </a>
            </Card>
          ))}
        </div>
      </Section>

      {/* All reports */}
      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">All reports</h2>
        <Table columns={columns} data={rows} rowKey={(r) => r.id} />
      </Section>

      {/* Methodology */}
      <Section className="pt-0">
        <Card className="space-y-2">
          <h2 className="text-h5 font-semibold text-text-primary">How we produce reports</h2>
          <p className="text-body-sm text-text-secondary">
            Every report begins with collected public signals and the evidence gathered around them. Trained
            reviewers assess the evidence, weigh competing explanations, and document the reasoning. A report
            is published only once its evidence chain is complete and a human reviewer has signed off. Each
            published report keeps its sources and traceability so readers can verify the findings, and
            corrections or retractions remain visible. Read more on our{' '}
            <a href="/methodology" className="font-semibold text-electric hover:text-white">methodology page</a>.
          </p>
        </Card>
      </Section>
    </>
  );
}
