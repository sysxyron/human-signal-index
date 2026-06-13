import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  MetricCard,
  SignalCard,
  CategoryTag,
  TraceabilityBadge,
  ReviewStatusBadge,
} from '@hsi/ui';
import { FileBarChart, Eye, Download, Share2 } from 'lucide-react';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';
import { ROUTES } from '@/lib/navigation/routes';

const reports = [
  { title: 'Q2 Narrative Landscape Review', category: 'Quarterly', tone: 'blue' as const, status: 'Approved' as const, trace: 97, views: '12.4K' },
  { title: 'Recruitment Tactics Across Platforms', category: 'Deep Dive', tone: 'orange' as const, status: 'Approved' as const, trace: 94, views: '8.1K' },
  { title: 'Health Misinformation Tracker', category: 'Ongoing', tone: 'red' as const, status: 'In Review' as const, trace: 91, views: '21.7K' },
];

export default function PublicReportsPage() {
  return (
    <DashboardPage
      title="Public Reports"
      subtitle="Published, evidence-backed findings for the public"
      actions={<SafeActionButton variant="primary" href={ROUTES.publishingNew}>Draft new report</SafeActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Published" value="214" accent="#3B82F6" icon={FileBarChart} delta={{ value: '+6', trend: 'up' }} />
        <MetricCard label="Total Views" value="1.8M" accent="#8B5CF6" icon={Eye} delta={{ value: '+12%', trend: 'up' }} />
        <MetricCard label="Downloads" value="92K" accent="#10B981" icon={Download} />
        <MetricCard label="Shares" value="48K" accent="#F59E0B" icon={Share2} delta={{ value: '+4%', trend: 'up' }} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title} interactive className="space-y-3">
            <div className="flex items-center justify-between">
              <CategoryTag label={r.category} tone={r.tone} />
              <ReviewStatusBadge status={r.status} />
            </div>
            <h3 className="text-h6 font-semibold text-text-primary">{r.title}</h3>
            <div className="flex items-center justify-between border-t border-border pt-3 text-caption text-text-muted">
              <span>{r.views} views</span>
              <TraceabilityBadge score={r.trace} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="space-y-4">
        <h3 className="text-h6 font-semibold text-text-primary">Featured finding</h3>
        <SignalCard
          title="Coordinated recruitment narrative across 4 platforms"
          summary="A cross-platform investigation into a recruitment campaign, with full evidence chain and rhetorical analysis published for public review."
          category="Recruitment"
          categoryTone="orange"
          riskLevel={5}
          traceability={94}
          source="HSI Research Desk"
          date="Jun 2026"
        />
      </Card>
    </DashboardPage>
  );
}
