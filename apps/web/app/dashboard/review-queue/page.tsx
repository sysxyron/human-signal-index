import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  Table,
  RiskBadge,
  CategoryTag,
  ReviewStatusBadge,
  TraceabilityBadge,
  type TableColumn,
  type RiskLevel,
  type ReviewStatus,
} from '@hsi/ui';
import { ListChecks, UserCheck, Clock, CheckCircle2 } from 'lucide-react';

interface ReviewRow {
  id: string;
  signal: string;
  category: string;
  tone: 'red' | 'orange' | 'purple' | 'blue';
  risk: RiskLevel;
  trace: number;
  reviewer: string;
  status: ReviewStatus;
}

const rows: ReviewRow[] = [
  { id: '1', signal: 'Coordinated recruitment narrative', category: 'Recruitment', tone: 'orange', risk: 5, trace: 94, reviewer: 'Unassigned', status: 'Escalated' },
  { id: '2', signal: 'Health misinformation cluster', category: 'Misinformation', tone: 'red', risk: 4, trace: 91, reviewer: 'A. Okafor', status: 'In Review' },
  { id: '3', signal: 'Influence operation indicators', category: 'Influence', tone: 'purple', risk: 4, trace: 88, reviewer: 'M. Chen', status: 'Pending' },
  { id: '4', signal: 'Election narrative seeding', category: 'Civic', tone: 'blue', risk: 3, trace: 96, reviewer: 'A. Okafor', status: 'Approved' },
  { id: '5', signal: 'Astroturfed product campaign', category: 'Astroturf', tone: 'orange', risk: 2, trace: 82, reviewer: 'L. Park', status: 'Rejected' },
];

const columns: TableColumn<ReviewRow>[] = [
  { key: 'signal', header: 'Signal', render: (r) => <span className="font-medium text-text-primary">{r.signal}</span> },
  { key: 'category', header: 'Category', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'risk', header: 'Risk', render: (r) => <RiskBadge level={r.risk} /> },
  { key: 'trace', header: 'Trace', render: (r) => <TraceabilityBadge score={r.trace} /> },
  { key: 'reviewer', header: 'Reviewer', render: (r) => <span className="text-text-secondary">{r.reviewer}</span> },
  { key: 'status', header: 'Status', render: (r) => <ReviewStatusBadge status={r.status} /> },
];

export default function ReviewQueuePage() {
  return (
    <DashboardPage
      title="Review Queue"
      subtitle="Human-in-the-loop verification workflow"
      actions={<Button variant="primary" size="sm">Claim next item</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending Review" value="8,432" accent="#F59E0B" icon={Clock} delta={{ value: '+312', trend: 'up' }} deltaTone="negative" />
        <MetricCard label="In Review" value="184" accent="#3B82F6" icon={ListChecks} />
        <MetricCard label="Reviewers Online" value="12" accent="#8B5CF6" icon={UserCheck} />
        <MetricCard label="Approved / 24h" value="1,021" accent="#10B981" icon={CheckCircle2} delta={{ value: '+9%', trend: 'up' }} />
      </div>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Items awaiting decision</h3>
        <Table columns={columns} data={rows} rowKey={(r) => r.id} />
      </Card>
    </DashboardPage>
  );
}
