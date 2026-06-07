import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  LineChart,
  Table,
  RiskBadge,
  CategoryTag,
  type TableColumn,
  type RiskLevel,
} from '@hsi/ui';
import { Gauge, TrendingUp, AlertTriangle, ShieldCheck } from 'lucide-react';

const riskTrend = [
  { name: 'Risk index', color: '#EF4444', data: [28, 31, 30, 38, 42, 40, 48, 52] },
  { name: 'Mitigated', color: '#10B981', data: [10, 14, 13, 18, 22, 24, 30, 36] },
];

interface ScoreRow {
  id: string;
  signal: string;
  category: string;
  tone: 'red' | 'orange' | 'purple' | 'blue';
  score: number;
  level: RiskLevel;
  factors: string;
}

const rows: ScoreRow[] = [
  { id: '1', signal: 'Recruitment campaign cluster', category: 'Recruitment', tone: 'orange', score: 92, level: 5, factors: 'Reach · Coordination · Urgency' },
  { id: '2', signal: 'Health misinformation spread', category: 'Misinformation', tone: 'red', score: 81, level: 4, factors: 'Virality · Harm potential' },
  { id: '3', signal: 'Influence operation', category: 'Influence', tone: 'purple', score: 76, level: 4, factors: 'State linkage · Persistence' },
  { id: '4', signal: 'Civic narrative seeding', category: 'Civic', tone: 'blue', score: 58, level: 3, factors: 'Reach · Framing' },
  { id: '5', signal: 'Product astroturf', category: 'Astroturf', tone: 'orange', score: 34, level: 2, factors: 'Coordination' },
];

const columns: TableColumn<ScoreRow>[] = [
  { key: 'signal', header: 'Signal', render: (r) => <span className="font-medium text-text-primary">{r.signal}</span> },
  { key: 'category', header: 'Category', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'factors', header: 'Top factors', render: (r) => <span className="text-text-secondary">{r.factors}</span> },
  { key: 'score', header: 'Score', align: 'right', render: (r) => <span className="font-semibold text-text-primary">{r.score}</span> },
  { key: 'level', header: 'Level', render: (r) => <RiskBadge level={r.level} /> },
];

export default function RiskScoringPage() {
  return (
    <DashboardPage
      title="Risk Scoring"
      subtitle="Explainable, review-ready risk prioritization"
      actions={<Button variant="primary" size="sm">Recalculate scores</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Risk Index" value="34.8" accent="#EF4444" icon={Gauge} delta={{ value: '+3.1%', trend: 'up' }} deltaTone="negative" />
        <MetricCard label="Critical Signals" value="48" accent="#B91C1C" icon={AlertTriangle} delta={{ value: '+6', trend: 'up' }} deltaTone="negative" />
        <MetricCard label="Mitigated" value="1,204" accent="#10B981" icon={ShieldCheck} delta={{ value: '+88', trend: 'up' }} />
        <MetricCard label="Avg Score" value="61.2" accent="#F59E0B" icon={TrendingUp} />
      </div>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Risk index over time</h3>
        <LineChart series={riskTrend} height={240} xLabels={['W1', 'W4', 'W8']} />
      </Card>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Scored signals</h3>
        <Table columns={columns} data={rows} rowKey={(r) => r.id} />
      </Card>
    </DashboardPage>
  );
}
