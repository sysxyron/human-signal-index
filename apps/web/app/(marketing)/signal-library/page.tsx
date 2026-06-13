import { PageHeader, Section } from '../../../components/page-header';
import {
  Card,
  SignalCard,
  Table,
  RiskBadge,
  CategoryTag,
  TraceabilityBadge,
  Input,
  Select,
  Button,
  type TableColumn,
  type RiskLevel,
  type CategoryTone,
} from '@hsi/ui';
import { Search } from 'lucide-react';

export const metadata = { title: 'Signal Library' };

const featured: {
  title: string;
  summary: string;
  category: string;
  tone: CategoryTone;
  risk: RiskLevel;
  trace: number;
  source: string;
  date: string;
}[] = [
  { title: 'Coordinated recruitment narrative', summary: 'Cross-platform messaging matching a known recruitment pattern, with urgency and in-group framing.', category: 'Recruitment', tone: 'orange', risk: 5, trace: 94, source: 'Telegram · 4 platforms', date: 'Jun 2026' },
  { title: 'Health misinformation cluster', summary: 'A viral health claim contradicting public-health consensus, amplified by inauthentic accounts.', category: 'Misinformation', tone: 'red', risk: 4, trace: 91, source: 'X · syndicated', date: 'Jun 2026' },
  { title: 'State-aligned influence operation', summary: 'Persistent amplification signature linked to a known influence network.', category: 'Influence', tone: 'purple', risk: 4, trace: 88, source: 'Facebook', date: 'May 2026' },
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
  { id: '1', title: 'Election narrative seeding', category: 'Civic', tone: 'blue', risk: 3, trace: 96, date: 'Jun 2026' },
  { id: '2', title: 'Astroturfed product campaign', category: 'Astroturf', tone: 'orange', risk: 2, trace: 82, date: 'Jun 2026' },
  { id: '3', title: 'Conspiracy framing revival', category: 'Disinformation', tone: 'purple', risk: 4, trace: 89, date: 'May 2026' },
  { id: '4', title: 'Localized fear messaging', category: 'Influence', tone: 'red', risk: 3, trace: 85, date: 'May 2026' },
  { id: '5', title: 'Benign viral trend', category: 'Cultural', tone: 'green', risk: 1, trace: 99, date: 'Apr 2026' },
];

const columns: TableColumn<Row>[] = [
  { key: 'title', header: 'Signal', render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
  { key: 'category', header: 'Category', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'risk', header: 'Risk', render: (r) => <RiskBadge level={r.risk} /> },
  { key: 'trace', header: 'Traceability', render: (r) => <TraceabilityBadge score={r.trace} /> },
  { key: 'date', header: 'Published', align: 'right', render: (r) => r.date },
];

export default function SignalLibraryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Signal Library"
        title="Browse structured, traceable signal records."
        description="A public catalog of analyzed narratives — each with a risk level, category, and a verifiable evidence chain."
      />

      <Section>
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input placeholder="Search signals…" className="pl-9" />
          </div>
          <Select className="sm:w-44">
            <option>All categories</option>
            <option>Misinformation</option>
            <option>Influence</option>
            <option>Recruitment</option>
          </Select>
          <Select className="sm:w-40">
            <option>Any risk</option>
            <option>Critical</option>
            <option>High</option>
            <option>Moderate</option>
          </Select>
          <Button variant="primary" disabled title="Live filtering is available in the dashboard Signals view.">Filter</Button>
        </Card>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">Featured signals</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {featured.map((s) => (
            <SignalCard
              key={s.title}
              title={s.title}
              summary={s.summary}
              category={s.category}
              categoryTone={s.tone}
              riskLevel={s.risk}
              traceability={s.trace}
              source={s.source}
              date={s.date}
            />
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">All records</h2>
        <Table columns={columns} data={rows} rowKey={(r) => r.id} />
      </Section>
    </>
  );
}
