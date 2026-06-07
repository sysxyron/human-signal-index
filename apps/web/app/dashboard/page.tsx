'use client';

import { useState } from 'react';
import {
  TopNav,
  Card,
  Button,
  MetricCard,
  LineChart,
  DonutChart,
  HeatmapCard,
  TimelineCard,
  AlertCard,
  SecurityEventCard,
  SourceTracePanel,
  EvidenceDrawer,
  Table,
  RiskBadge,
  CategoryTag,
  TraceabilityBadge,
  type TableColumn,
  type RiskLevel,
} from '@hsi/ui';
import { Database, Activity, ShieldCheck, AlertTriangle, Plus } from 'lucide-react';

const kpis = [
  { label: 'Active Sources', value: '24,781', accent: '#3B82F6', icon: Database, spark: [12, 18, 15, 22, 28, 26, 34], delta: { value: '+4.2%', trend: 'up' as const } },
  { label: 'Signals Analyzed', value: '152,390', accent: '#8B5CF6', icon: Activity, spark: [40, 38, 52, 60, 58, 72, 88], delta: { value: '+9.1%', trend: 'up' as const } },
  { label: 'High-Risk Signals', value: '312', accent: '#EF4444', icon: AlertTriangle, spark: [8, 10, 9, 14, 12, 18, 22], delta: { value: '+6.7%', trend: 'up' as const }, deltaTone: 'negative' as const },
  { label: 'Traceability', value: '96.3%', accent: '#10B981', icon: ShieldCheck, spark: [90, 91, 93, 92, 95, 95, 96], delta: { value: '+0.6%', trend: 'up' as const } },
];

const trendSeries = [
  { name: 'Signals', color: '#3B82F6', data: [120, 160, 140, 200, 240, 220, 300, 340, 380] },
  { name: 'Reviewed', color: '#10B981', data: [80, 110, 100, 150, 170, 180, 220, 250, 290] },
  { name: 'High-risk', color: '#EF4444', data: [20, 28, 24, 40, 48, 44, 62, 70, 86] },
];

const heat = Array.from({ length: 6 }, (_, r) =>
  Array.from({ length: 14 }, (_, c) => Math.abs(Math.sin((r + 1) * 1.3 + (c + 1) * 0.7))),
);

interface SignalRow {
  id: string;
  title: string;
  category: string;
  tone: 'red' | 'purple' | 'orange' | 'blue';
  risk: RiskLevel;
  trace: number;
  platform: string;
}

const topSignals: SignalRow[] = [
  { id: 's1', title: 'Coordinated recruitment campaign', category: 'Recruitment', tone: 'orange', risk: 5, trace: 94, platform: 'Telegram' },
  { id: 's2', title: 'Health misinformation cluster', category: 'Misinformation', tone: 'red', risk: 4, trace: 91, platform: 'X' },
  { id: 's3', title: 'State-aligned influence op', category: 'Influence', tone: 'purple', risk: 4, trace: 88, platform: 'Facebook' },
  { id: 's4', title: 'Election narrative seeding', category: 'Civic', tone: 'blue', risk: 3, trace: 96, platform: 'YouTube' },
  { id: 's5', title: 'Astroturfed product campaign', category: 'Astroturf', tone: 'orange', risk: 2, trace: 82, platform: 'Reddit' },
];

const columns: TableColumn<SignalRow>[] = [
  { key: 'title', header: 'Signal', render: (r) => <span className="font-medium text-text-primary">{r.title}</span> },
  { key: 'category', header: 'Category', render: (r) => <CategoryTag label={r.category} tone={r.tone} /> },
  { key: 'platform', header: 'Platform', render: (r) => r.platform },
  { key: 'risk', header: 'Risk', render: (r) => <RiskBadge level={r.risk} /> },
  { key: 'trace', header: 'Traceability', align: 'right', render: (r) => <TraceabilityBadge score={r.trace} /> },
];

const evidence = [
  { passage: 'Join the movement before the window closes — they don\'t want you to see this.', source: 'telegram.me/channel-x', capturedAt: '2h ago', hash: '0x9af3…b21c' },
  { passage: 'Share this with 10 people in the next hour or stay asleep forever.', source: 'x.com/handle', capturedAt: '3h ago', hash: '0x44de…91aa' },
  { passage: 'Official sources are lying. Here is the "real" data they suppress.', source: 'fb.com/page', capturedAt: '5h ago', hash: '0x7c0a…f3e2' },
];

export default function MissionControlPage() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <TopNav title="Mission Control" subtitle="Real-time signal intelligence overview" />
      <main className="space-y-6 p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h4 font-semibold text-text-primary">Operational overview</h2>
            <p className="text-body-sm text-text-muted">Last synced 30 seconds ago · Live</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
              Open Evidence Vault
            </Button>
            <Button variant="primary" size="sm">
              <Plus className="h-4 w-4" /> New report
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <MetricCard
              key={k.label}
              label={k.label}
              value={k.value}
              accent={k.accent}
              icon={k.icon}
              sparkline={k.spark}
              sparklineColor={k.accent}
              delta={k.delta}
              deltaTone={k.deltaTone}
            />
          ))}
        </div>

        {/* charts row */}
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-h6 font-semibold text-text-primary">Signal activity</h3>
                <p className="text-caption text-text-muted">Volume vs. review throughput</p>
              </div>
              <span className="text-caption text-text-muted">Last 9 weeks</span>
            </div>
            <LineChart series={trendSeries} height={260} xLabels={['W1', 'W5', 'W9']} />
          </Card>
          <Card className="flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-h6 font-semibold text-text-primary">Risk distribution</h3>
              <p className="text-caption text-text-muted">By narrative category</p>
            </div>
            <DonutChart
              centerValue="312"
              centerLabel="high-risk"
              segments={[
                { label: 'Misinformation', value: 34, color: '#EF4444' },
                { label: 'Influence Ops', value: 26, color: '#8B5CF6' },
                { label: 'Recruitment', value: 22, color: '#F59E0B' },
                { label: 'Civic', value: 18, color: '#3B82F6' },
              ]}
            />
          </Card>
        </div>

        {/* heatmap + trace */}
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <HeatmapCard
            title="Narrative propagation heatmap"
            subtitle="Activity intensity by region & hour"
            matrix={heat}
            rowLabels={['NA', 'EU', 'APAC', 'LATAM', 'MEA', 'AFR']}
            colLabels={['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22', '23', '24']}
            color="#EF4444"
          />
          <SourceTracePanel />
        </div>

        {/* table + side column */}
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-h6 font-semibold text-text-primary">Top signals by risk</h3>
              <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
                View evidence
              </Button>
            </div>
            <Table columns={columns} data={topSignals} rowKey={(r) => r.id} />
          </Card>

          <div className="space-y-4">
            <AlertCard
              severity="critical"
              title="Recruitment surge detected"
              description="High-risk pattern across 4 platforms in the last 90 minutes."
              time="2 min ago"
            />
            <SecurityEventCard
              severity="high"
              title="Repeated admin login failures"
              source="auth-gateway · 203.0.113.42"
              status="Auto-throttled"
              time="14 min ago"
            />
            <TimelineCard
              title="Recent activity"
              items={[
                { time: '09:42', title: 'Signal escalated to review', tone: 'orange' },
                { time: '09:30', title: 'Evidence batch archived', description: '37 passages hashed', tone: 'green' },
                { time: '09:12', title: 'New source registered', tone: 'blue' },
                { time: '08:55', title: 'Counter-narrative drafted', tone: 'purple' },
              ]}
            />
          </div>
        </div>
      </main>

      <EvidenceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={evidence}
        footer={
          <Button variant="primary" className="w-full">
            Export evidence bundle
          </Button>
        }
      />
    </>
  );
}
