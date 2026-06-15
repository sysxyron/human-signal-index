import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import {
  FileText,
  Cpu,
  BrainCircuit,
  UserCheck,
  Megaphone,
  ShieldCheck,
} from 'lucide-react';

export const metadata = { title: 'Methodology' };

const pipeline = [
  {
    icon: FileText,
    color: '#3B82F6',
    title: 'Raw source material',
    body: 'Public posts, articles, transcripts, and campaigns are captured and archived with timestamps and cryptographic hashes.',
  },
  {
    icon: Cpu,
    color: '#8B5CF6',
    title: 'AI extraction',
    body: 'Models extract claims, entities, and rhetorical structures from raw material — always preserving a link to the exact source passage.',
  },
  {
    icon: BrainCircuit,
    color: '#F59E0B',
    title: 'AI interpretation',
    body: 'A structured classifier interprets framing, technique, and influence patterns, attaching a confidence score to every inference.',
  },
  {
    icon: UserCheck,
    color: '#10B981',
    title: 'Human review',
    body: 'Trained reviewers verify, challenge, or reject each interpretation. Models assist; humans make the published call.',
  },
  {
    icon: Megaphone,
    color: '#EF4444',
    title: 'Public report',
    body: 'Only verified, fully-traceable findings are published — with the evidence chain available for public inspection.',
  },
];

import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { CmsBlocks as CmsBlocksView } from '@/components/cms/CmsBlocks';
export default async function MethodologyPage() {
  const cms = await cmsGet('methodology');
  if (cms) return <CmsBlocksView blocks={cms.blocks} />;
  return (
    <>
      <PageHeader
        eyebrow="Methodology"
        title="From raw source material to a traceable public report."
        description="HSI runs a five-stage pipeline. At every stage, one rule holds: every claim must be traceable back to its source."
      />

      <Section>
        <ol className="space-y-4">
          {pipeline.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.title}>
                <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-4 sm:flex-col sm:items-center">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${step.color}1f`, color: step.color }}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-label text-text-muted">Step {i + 1}</span>
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-h5 font-semibold text-text-primary">{step.title}</h2>
                    <p className="text-body text-text-secondary">{step.body}</p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section className="pt-0">
        <Card className="flex flex-col items-start gap-4 border-verified/30 bg-verified/5 sm:flex-row sm:items-center">
          <ShieldCheck className="h-8 w-8 shrink-0 text-verified" />
          <div>
            <h3 className="text-h5 font-semibold text-text-primary">
              Every claim must be traceable.
            </h3>
            <p className="mt-1 text-body text-text-secondary">
              This is the non-negotiable foundation of HSI. If a conclusion cannot
              be walked backward to a verifiable source, it is not published.
            </p>
          </div>
        </Card>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">Confidence, not certainty</h3>
            <p className="text-body-sm text-text-secondary">
              Every AI inference carries an explicit confidence score so reviewers
              and readers can weigh it appropriately.
            </p>
          </Card>
          <Card className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">Documented limitations</h3>
            <p className="text-body-sm text-text-secondary">
              We publish what our models can and cannot do, including known
              failure modes and category boundaries.
            </p>
          </Card>
          <Card className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">Reproducible analysis</h3>
            <p className="text-body-sm text-text-secondary">
              Archived evidence and versioned models mean findings can be
              re-examined and independently audited.
            </p>
          </Card>
        </div>
      </Section>
    </>
  );
}
