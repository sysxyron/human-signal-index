import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  MetricCard,
  SecurityEventCard,
  LineChart,
  TimelineCard,
} from '@hsi/ui';
import { ShieldAlert, Lock, Activity, Eye } from 'lucide-react';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { ROUTES } from '@/lib/navigation/routes';

const events = [
  { severity: 'high' as const, title: 'Repeated admin login failures', source: 'auth-gateway · 203.0.113.42', status: 'Auto-throttled', time: '14 min ago' },
  { severity: 'medium' as const, title: 'Unusual API request volume', source: 'api · key ****8f21', status: 'Rate-limited', time: '38 min ago' },
  { severity: 'critical' as const, title: 'Privilege escalation attempt', source: 'console · user mchen', status: 'Blocked + escalated', time: '1h ago' },
  { severity: 'info' as const, title: 'New API key issued', source: 'admin · approved', status: 'Acknowledged', time: '2h ago' },
];

const trafficTrend = [
  { name: 'Requests', color: '#3B82F6', data: [120, 160, 140, 180, 220, 200, 260, 240] },
  { name: 'Blocked', color: '#EF4444', data: [4, 8, 6, 12, 10, 18, 14, 22] },
];

export default function SecurityMonitorPage() {
  return (
    <DashboardPage
      title="Security Monitor"
      subtitle="Platform integrity and access monitoring"
      actions={<SafeActionButton variant="primary" href={ROUTES.security}>View security center</SafeActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Threats Blocked" value="1,284" accent="#EF4444" icon={ShieldAlert} delta={{ value: '+22', trend: 'up' }} deltaTone="negative" />
        <MetricCard label="Failed Logins" value="312" accent="#F59E0B" icon={Lock} delta={{ value: '-18', trend: 'down' }} deltaTone="positive" />
        <MetricCard label="Active Sessions" value="148" accent="#3B82F6" icon={Activity} />
        <MetricCard label="Audit Events / 24h" value="9,021" accent="#8B5CF6" icon={Eye} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="space-y-4">
          <h3 className="text-h6 font-semibold text-text-primary">Traffic & blocked requests</h3>
          <LineChart series={trafficTrend} height={240} xLabels={['00h', '12h', '24h']} />
        </Card>
        <TimelineCard
          title="Access audit log"
          items={[
            { time: '09:48', title: 'Admin login (MFA) — success', tone: 'green' },
            { time: '09:31', title: 'Privilege escalation blocked', tone: 'red' },
            { time: '09:10', title: 'API key rotated', tone: 'blue' },
            { time: '08:52', title: 'Rate limit applied to key ****8f21', tone: 'orange' },
          ]}
        />
      </div>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Security events</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {events.map((e) => (
            <SecurityEventCard key={e.title} {...e} />
          ))}
        </div>
      </Card>
    </DashboardPage>
  );
}
