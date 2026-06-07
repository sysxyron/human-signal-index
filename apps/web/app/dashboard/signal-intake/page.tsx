import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  LineChart,
  SignalCard,
  Table,
  CategoryTag,
  ReviewStatusBadge,
  type TableColumn,
  type ReviewStatus,
} from '@hsi/ui';
import { Inbox, Filter, Cpu, Clock } from 'lucide-react';

const intakeTrend = [
  { name: 'Ingested', color: '#3B82F6', data: [220, 280, 260, 340, 380, 420, 500] },
  { name: 'Auto-triaged', color: '#8B5CF6', data: [180, 230, 210, 290, 320, 360, 430] },
];

interface QueueRow {
  id: string;
  signal: string;
  category: string;
  tone: 'blue' | 'red' | 'orange' | 'purple';
  status: ReviewStatus;
  age: string;
}

const queue: QueueRow[] = [
  { id: '1', signal: 'Unverified claim about water supply', category: 'Misinformation', tone: 'red', status: 'Pending', age: '3m' },
  { id: '2', signal: 'New hashtag campaign cluster', category: 'Influence', tone: 'purple', status: 'In Review', age: '12m' },
  { id: '3', signal: 'Cross-platform repost burst', category: 'Astroturf', tone: 'orange', status: 'Pending', age: '21m' },
  { id: '4', signal: 'Localized recruitment messaging', category: 'Recruitment', tone: 'orange', status: 'Escalated', age: '44m' },
];

const columns: TableColumn<QueueRow>[] = [
  { key: 'signal', header: 'Incoming signal', render: (r) => <span className="font-medium text-text-primary">{r.signal}</span> },
  { key: 'category', header: 'Category', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'status', header: 'Status', render: (r) => <ReviewStatusBadge status={r.status} /> },
  { key: 'age', header: 'Age', align: 'right', render: (r) => r.age },
];

export default function SignalIntakePage() {
  return (
    <DashboardPage
      title="Signal Intake"
      subtitle="Ingestion pipeline and triage queue"
      actions={
        <>
          <Button variant="secondary" size="sm"><Filter className="h-4 w-4" /> Filters</Button>
          <Button variant="primary" size="sm">Run triage</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ingested / 24h" value="9,204" accent="#3B82F6" icon={Inbox} delta={{ value: '+12%', trend: 'up' }} />
        <MetricCard label="Auto-triaged" value="86.4%" accent="#8B5CF6" icon={Cpu} delta={{ value: '+2.1%', trend: 'up' }} />
        <MetricCard label="Awaiting Review" value="8,432" accent="#F59E0B" icon={Clock} delta={{ value: '+312', trend: 'up' }} deltaTone="negative" />
        <MetricCard label="Avg Triage Time" value="2.4s" accent="#10B981" delta={{ value: '-0.3s', trend: 'down' }} deltaTone="positive" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="space-y-4">
          <h3 className="text-h6 font-semibold text-text-primary">Ingestion throughput</h3>
          <LineChart series={intakeTrend} height={240} xLabels={['Mon', 'Thu', 'Sun']} />
        </Card>
        <SignalCard
          title="Coordinated recruitment narrative"
          summary="Newly ingested cluster matching a known recruitment pattern across 4 platforms. Flagged for priority human review."
          category="Recruitment"
          categoryTone="orange"
          riskLevel={5}
          traceability={94}
          source="telegram · channel-x"
          date="Just now"
        />
      </div>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Triage queue</h3>
        <Table columns={columns} data={queue} rowKey={(r) => r.id} />
      </Card>
    </DashboardPage>
  );
}
