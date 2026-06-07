import { PageHeader, Section } from '../../../components/page-header';
import { Card, MetricCard, TraceabilityBadge } from '@hsi/ui';
import { FileText, GitBranch, Database, CheckCircle2 } from 'lucide-react';

export const metadata = { title: 'Transparency' };

const commitments = [
  { icon: FileText, title: 'Open methodology', body: 'Our full pipeline — from capture to publication — is documented and public.' },
  { icon: GitBranch, title: 'Versioned models', body: 'Every classifier version is recorded so findings can be reproduced and audited.' },
  { icon: Database, title: 'Auditable evidence', body: 'Archived evidence is hash-sealed; integrity can be independently verified.' },
  { icon: CheckCircle2, title: 'Correction log', body: 'When we get something wrong, we publish the correction and the reason.' },
];

const stats = [
  { label: 'Findings Published', value: '214', accent: '#3B82F6' },
  { label: 'Corrections Issued', value: '7', accent: '#F59E0B' },
  { label: 'Avg Traceability', value: '96.3%', accent: '#10B981' },
];

export default function TransparencyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Transparency"
        title="If you can't audit it, you shouldn't trust it."
        description="HSI is built to be inspected. We publish our methods, our model versions, our evidence integrity, and our mistakes."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <MetricCard key={s.label} label={s.label} value={s.value} accent={s.accent} />
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {commitments.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric/15 text-electric">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-h6 font-semibold text-text-primary">{c.title}</h2>
                  <p className="mt-1 text-body-sm text-text-secondary">{c.body}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-h5 font-semibold text-text-primary">
              Traceability is measurable.
            </h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              We report a live traceability score across all published findings —
              and we hold ourselves to it.
            </p>
          </div>
          <TraceabilityBadge score={96.3} />
        </Card>
      </Section>
    </>
  );
}
