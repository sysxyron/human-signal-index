import { DashboardPage } from '../../../components/dashboard-shell';
import {
  Card,
  Button,
  MetricCard,
  Input,
  Textarea,
  Select,
  CategoryTag,
  ReviewStatusBadge,
} from '@hsi/ui';
import { Megaphone, PenLine, Send, FileText } from 'lucide-react';

const drafts = [
  { title: 'Clarifying the water-supply claim', category: 'Misinformation', tone: 'red' as const, status: 'In Review' as const },
  { title: 'Context for recruitment messaging', category: 'Recruitment', tone: 'orange' as const, status: 'Approved' as const },
  { title: 'Debunking the suppressed-data narrative', category: 'Disinformation', tone: 'purple' as const, status: 'Pending' as const },
];

export default function CounterNarrativePage() {
  return (
    <DashboardPage
      title="Counter-Narrative Studio"
      subtitle="Draft evidence-based responses and explainers"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Drafts" value="38" accent="#8B5CF6" icon={PenLine} />
        <MetricCard label="Published" value="214" accent="#10B981" icon={Send} delta={{ value: '+6', trend: 'up' }} />
        <MetricCard label="Templates" value="12" accent="#3B82F6" icon={FileText} />
        <MetricCard label="Avg Turnaround" value="6.2h" accent="#F59E0B" icon={Megaphone} delta={{ value: '-1.1h', trend: 'down' }} deltaTone="positive" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-4">
          <h3 className="text-h6 font-semibold text-text-primary">New counter-narrative</h3>
          <Input label="Title" placeholder="A clear, factual headline" id="cn-title" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Responds to" id="cn-target">
              <option>Recruitment campaign cluster</option>
              <option>Health misinformation spread</option>
              <option>Influence operation</option>
            </Select>
            <Select label="Audience" id="cn-aud">
              <option>General public</option>
              <option>Educators</option>
              <option>Journalists</option>
            </Select>
          </div>
          <Textarea label="Evidence-based response" rows={6} placeholder="Ground every statement in a traceable source…" id="cn-body" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm">Save draft</Button>
            <Button variant="primary" size="sm"><Send className="h-4 w-4" /> Submit for review</Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-h6 font-semibold text-text-primary">Recent drafts</h3>
          <div className="space-y-3">
            {drafts.map((d) => (
              <div key={d.title} className="rounded-card border border-border bg-surface-2/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-body-sm font-semibold text-text-primary">{d.title}</span>
                  <ReviewStatusBadge status={d.status} />
                </div>
                <div className="mt-2">
                  <CategoryTag label={d.category} tone={d.tone} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardPage>
  );
}
