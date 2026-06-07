import { DashboardPage } from '../../../components/dashboard-shell';
import { Card, Button, MetricCard, AlertCard } from '@hsi/ui';
import { Bell, AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react';

const alerts = [
  { severity: 'critical' as const, title: 'Recruitment surge detected', description: 'High-risk pattern across 4 platforms in the last 90 minutes.', time: '2 min ago' },
  { severity: 'high' as const, title: 'Misinformation virality spike', description: 'Health claim cluster crossed 250K estimated reach.', time: '18 min ago' },
  { severity: 'high' as const, title: 'New influence-op indicators', description: 'State-aligned amplification signature matched.', time: '41 min ago' },
  { severity: 'medium' as const, title: 'Source trust downgraded', description: 'channel-x dropped below trust threshold (64%).', time: '1h ago' },
  { severity: 'info' as const, title: 'Weekly digest ready', description: 'Public report draft compiled for editorial review.', time: '3h ago' },
];

export default function AlertsPage() {
  return (
    <DashboardPage
      title="Alerts"
      subtitle="Real-time risk and operational notifications"
      actions={
        <>
          <Button variant="secondary" size="sm">Configure rules</Button>
          <Button variant="primary" size="sm">Mark all read</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active Alerts" value="27" accent="#EF4444" icon={BellRing} delta={{ value: '+5', trend: 'up' }} deltaTone="negative" />
        <MetricCard label="Critical" value="3" accent="#B91C1C" icon={AlertTriangle} />
        <MetricCard label="Acknowledged" value="148" accent="#3B82F6" icon={Bell} />
        <MetricCard label="Resolved / 24h" value="92" accent="#10B981" icon={CheckCircle2} delta={{ value: '+11', trend: 'up' }} />
      </div>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Live alert feed</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((a) => (
            <AlertCard key={a.title} {...a} />
          ))}
        </div>
      </Card>
    </DashboardPage>
  );
}
