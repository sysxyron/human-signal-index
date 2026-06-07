import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  SourceTracePanel,
  TimelineCard,
  TraceabilityBadge,
} from '@hsi/ui';
import { Network, Link2, GitBranch, ShieldCheck } from 'lucide-react';

export default function TraceabilityEnginePage() {
  return (
    <DashboardPage
      title="Traceability Engine"
      subtitle="Signal → Evidence → Analysis → Source provenance"
      actions={<Button variant="primary" size="sm">Rebuild trace graph</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Traceability Score" value="96.3%" accent="#10B981" icon={ShieldCheck} delta={{ value: '+0.6%', trend: 'up' }} />
        <MetricCard label="Linked Claims" value="148,902" accent="#3B82F6" icon={Link2} delta={{ value: '+2,104', trend: 'up' }} />
        <MetricCard label="Trace Depth (avg)" value="4.2" accent="#8B5CF6" icon={GitBranch} />
        <MetricCard label="Broken Links" value="312" accent="#EF4444" icon={Network} delta={{ value: '-44', trend: 'down' }} deltaTone="positive" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <SourceTracePanel />
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-h6 font-semibold text-text-primary">Why traceability?</h3>
              <TraceabilityBadge score={96.3} />
            </div>
            <p className="text-body-sm text-text-secondary">
              Every published conclusion in HSI can be walked backward — from the
              public claim, through the analysis that produced it, to the archived
              evidence, and finally to the original source. No claim is published
              without an intact chain.
            </p>
            <ul className="space-y-2 text-body-sm text-text-secondary">
              <li>• Each node carries an independent confidence score.</li>
              <li>• Evidence is hash-sealed and tamper-evident.</li>
              <li>• Human reviewers can challenge any link.</li>
            </ul>
          </Card>
          <TimelineCard
            title="Trace audit log"
            items={[
              { time: '09:48', title: 'Chain verified for signal #4821', tone: 'green' },
              { time: '09:30', title: 'Re-linked orphaned evidence batch', tone: 'orange' },
              { time: '09:02', title: 'New source node added to graph', tone: 'blue' },
              { time: '08:40', title: 'Confidence recomputed (model v3.2)', tone: 'purple' },
            ]}
          />
        </div>
      </div>
    </DashboardPage>
  );
}
