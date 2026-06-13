import { PageHeader, Section } from '../../../components/page-header';
import {
  Card,
  Button,
  Table,
  CategoryTag,
  TraceabilityBadge,
  RiskBadge,
  type TableColumn,
  type RiskLevel,
  type CategoryTone,
} from '@hsi/ui';
import { Download, ArrowUpRight } from 'lucide-react';

export const metadata = { title: 'Research Reports' };

const featured: {
  title: string;
  blurb: string;
  category: string;
  tone: CategoryTone;
  trace: number;
  date: string;
}[] = [
  { title: 'Q2 Narrative Landscape Review', blurb: 'A quarterly synthesis of the dominant narratives, emerging risks, and shifts in influence tactics.', category: 'Quarterly', tone: 'blue', trace: 97, date: 'Jun 2026' },
  { title: 'Recruitment Tactics Across Platforms', blurb: 'A deep dive into how recruitment narratives adapt their rhetoric to different platform cultures.', category: 'Deep Dive', tone: 'orange', trace: 94, date: 'May 2026' },
  { title: 'Anatomy of a Health-Misinfo Cascade', blurb: 'Tracing a single false claim from origin to mass amplification, with the full evidence chain.', category: 'Case Study', tone: 'red', trace: 92, date: 'Apr 2026' },
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
  { id: '1', title: 'Cross-border disinformation flows', category: 'Deep Dive', tone: 'purple', risk: 4, trace: 90, date: 'Mar 2026' },
  { id: '2', title: 'Civic narratives during elections', category: 'Report', tone: 'blue', risk: 3, trace: 95, date: 'Feb 2026' },
  { id: '3', title: 'Astroturfing economics', category: 'Case Study', tone: 'orange', risk: 2, trace: 84, date: 'Jan 2026' },
  { id: '4', title: 'Rhetoric taxonomy v3 release notes', category: 'Methodology', tone: 'green', risk: 1, trace: 99, date: 'Jan 2026' },
];

const columns: TableColumn<Row>[] = [
  { key: 'title', header: 'Report', render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
  { key: 'category', header: 'Type', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'risk', header: 'Subject risk', render: (r) => <RiskBadge level={r.risk} /> },
  { key: 'trace', header: 'Traceability', render: (r) => <TraceabilityBadge score={r.trace} /> },
  { key: 'date', header: 'Published', align: 'right', render: (r) => r.date },
];

export default function ResearchReportsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Research Reports"
        title="Evidence-backed findings, published for the public."
        description="In-depth analyses of narratives and influence patterns — every conclusion traceable to its source."
      />

      <Section>
        <div className="grid gap-4 lg:grid-cols-3">
          {featured.map((r) => (
            <Card key={r.title} interactive className="flex flex-col gap-3">
              <CategoryTag label={r.category} tone={r.tone} />
              <h2 className="text-h6 font-semibold text-text-primary">{r.title}</h2>
              <p className="text-body-sm text-text-secondary">{r.blurb}</p>
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                <TraceabilityBadge score={r.trace} />
                <span className="text-caption text-text-muted">{r.date}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" disabled title="The full report reader is being prepared and will be available soon.">
                  Read <ArrowUpRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled title="Report downloads will be available soon." aria-label="Download report">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">All reports</h2>
        <Table columns={columns} data={rows} rowKey={(r) => r.id} />
      </Section>
    </>
  );
}
