import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  MetricCard,
  DonutChart,
  HeatmapCard,
  CategoryTag,
  type CategoryTone,
} from '@hsi/ui';
import { ScanText, Cpu, Target, Layers } from 'lucide-react';
import { SafeActionButton } from '@/components/navigation/SafeActionButton';

const techniques: { label: string; tone: CategoryTone; pct: number }[] = [
  { label: 'In-group / Out-group', tone: 'purple', pct: 82 },
  { label: 'Urgency Appeal', tone: 'orange', pct: 74 },
  { label: 'Fear Framing', tone: 'red', pct: 68 },
  { label: 'Authority Mimicry', tone: 'blue', pct: 61 },
  { label: 'False Dilemma', tone: 'green', pct: 47 },
  { label: 'Repetition / Flooding', tone: 'orange', pct: 39 },
];

const confusionHeat = Array.from({ length: 5 }, (_, r) =>
  Array.from({ length: 5 }, (_, c) => (r === c ? 0.9 : Math.abs(Math.sin(r + c)) * 0.4)),
);

export default function RhetoricClassifierPage() {
  return (
    <DashboardPage
      title="Rhetoric Classifier"
      subtitle="Structured taxonomy of rhetoric, framing & influence"
      actions={<SafeActionButton variant="primary" disabledReason="Classification runs automatically as signals are ingested by the classifier worker.">Re-run classifier</SafeActionButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Classified / 24h" value="7,841" accent="#8B5CF6" icon={ScanText} delta={{ value: '+8%', trend: 'up' }} />
        <MetricCard label="Model Accuracy" value="93.1%" accent="#10B981" icon={Target} delta={{ value: '+0.4%', trend: 'up' }} />
        <MetricCard label="Avg Confidence" value="0.88" accent="#3B82F6" icon={Cpu} />
        <MetricCard label="Active Techniques" value="24" accent="#F59E0B" icon={Layers} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="space-y-4">
          <h3 className="text-h6 font-semibold text-text-primary">Detected rhetorical techniques</h3>
          <div className="space-y-3">
            {techniques.map((t) => (
              <div key={t.label} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <CategoryTag label={t.label} tone={t.tone} />
                  <span className="text-caption font-semibold text-text-primary">{t.pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-electric" style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-h6 font-semibold text-text-primary">Category mix</h3>
            <p className="text-caption text-text-muted">Share of classified signals</p>
          </div>
          <DonutChart
            centerValue="7.8K"
            centerLabel="signals"
            segments={[
              { label: 'Persuasion', value: 38, color: '#8B5CF6' },
              { label: 'Disinformation', value: 27, color: '#EF4444' },
              { label: 'Mobilization', value: 21, color: '#F59E0B' },
              { label: 'Neutral', value: 14, color: '#3B82F6' },
            ]}
          />
        </Card>
      </div>

      <HeatmapCard
        title="Classifier confusion matrix"
        subtitle="Predicted vs. actual category (normalized)"
        matrix={confusionHeat}
        rowLabels={['Persu.', 'Disinf.', 'Mobil.', 'Recruit', 'Neutral']}
        colLabels={['Persu.', 'Disinf.', 'Mobil.', 'Recruit', 'Neutral']}
        color="#8B5CF6"
      />
    </DashboardPage>
  );
}
