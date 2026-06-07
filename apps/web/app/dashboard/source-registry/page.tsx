import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  Table,
  CategoryTag,
  TraceabilityBadge,
  type TableColumn,
} from '@hsi/ui';
import { Database, Globe, Rss, ShieldCheck } from 'lucide-react';

interface SourceRow {
  id: string;
  name: string;
  platform: string;
  tone: 'blue' | 'purple' | 'orange' | 'green';
  reach: string;
  signals: number;
  trust: number;
  status: string;
}

const sources: SourceRow[] = [
  { id: '1', name: '@global_watch', platform: 'X', tone: 'blue', reach: '1.2M', signals: 482, trust: 91, status: 'Verified' },
  { id: '2', name: 'channel-x', platform: 'Telegram', tone: 'orange', reach: '88K', signals: 1204, trust: 64, status: 'Monitored' },
  { id: '3', name: 'TruthNetwork', platform: 'YouTube', tone: 'purple', reach: '640K', signals: 312, trust: 78, status: 'Verified' },
  { id: '4', name: 'r/openforum', platform: 'Reddit', tone: 'green', reach: '320K', signals: 198, trust: 84, status: 'Verified' },
  { id: '5', name: 'newswire-aggregator', platform: 'RSS', tone: 'blue', reach: '—', signals: 5021, trust: 96, status: 'Trusted' },
];

const columns: TableColumn<SourceRow>[] = [
  { key: 'name', header: 'Source', render: (r) => <span className="font-medium text-text-primary">{r.name}</span> },
  { key: 'platform', header: 'Platform', render: (r) => <CategoryTag label={r.platform} tone={r.tone} /> },
  { key: 'reach', header: 'Reach', render: (r) => r.reach },
  { key: 'signals', header: 'Signals', align: 'right', render: (r) => r.signals.toLocaleString() },
  { key: 'trust', header: 'Trust', align: 'right', render: (r) => <TraceabilityBadge score={r.trust} /> },
  { key: 'status', header: 'Status', render: (r) => <span className="text-text-secondary">{r.status}</span> },
];

export default function SourceRegistryPage() {
  return (
    <DashboardPage
      title="Source Registry"
      subtitle="Registered and monitored public sources"
      actions={<Button variant="primary" size="sm">Register source</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Sources" value="24,781" accent="#3B82F6" icon={Database} delta={{ value: '+128', trend: 'up' }} />
        <MetricCard label="Verified" value="18,204" accent="#10B981" icon={ShieldCheck} delta={{ value: '+64', trend: 'up' }} />
        <MetricCard label="Platforms" value="42" accent="#8B5CF6" icon={Globe} />
        <MetricCard label="Feeds Active" value="3,910" accent="#F59E0B" icon={Rss} delta={{ value: '-12', trend: 'down' }} deltaTone="positive" />
      </div>
      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Registered sources</h3>
        <Table columns={columns} data={sources} rowKey={(r) => r.id} />
      </Card>
    </DashboardPage>
  );
}
