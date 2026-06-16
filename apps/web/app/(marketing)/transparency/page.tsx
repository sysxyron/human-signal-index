import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { FileText, GitBranch, Database, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Transparency',
  description:
    'How Human Signal Index stays inspectable: open methodology, versioned models, hash-sealed evidence, and a public correction log.',
  alternates: { canonical: '/transparency' },
};

const commitments = [
  { icon: FileText, title: 'Open methodology', body: 'Our full pipeline, from capture to publication, is documented and public.' },
  { icon: GitBranch, title: 'Versioned models', body: 'Every classifier version is recorded so findings can be reproduced and audited.' },
  { icon: Database, title: 'Auditable evidence', body: 'Archived evidence is hash-sealed, so its integrity can be verified independently.' },
  { icon: CheckCircle2, title: 'Correction log', body: 'When we get something wrong, we publish the correction and the reason for it.' },
];

export default function TransparencyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Transparency"
        title="If you cannot audit it, you should not trust it."
        description="HSI is built to be inspected. We publish our methods, our model versions, how we protect evidence integrity, and the mistakes we correct."
      />

      <Section>
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
        <Card className="space-y-2">
          <h2 className="text-h5 font-semibold text-text-primary">Traceability is measurable</h2>
          <p className="text-body-sm text-text-secondary">
            Each published finding carries a traceability indicator that reflects how completely its
            conclusions link back to source evidence. We report it openly and hold our own work to it. When
            a finding cannot meet the bar, it is not published.
          </p>
        </Card>
      </Section>
    </>
  );
}
