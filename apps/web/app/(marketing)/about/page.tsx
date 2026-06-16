import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { ShieldCheck, Eye, Network, Scale, Award } from 'lucide-react';
import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { CmsBlocks as CmsBlocksView } from '@/components/cms/CmsBlocks';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Human Signal Index is a public-interest intelligence platform that collects public signals, reviews evidence, and publishes traceable, human-reviewed analysis.',
  alternates: { canonical: '/about' },
};

const differences = [
  { icon: ShieldCheck, title: 'Evidence first', body: 'Nothing is published without a verifiable evidence chain that anyone can inspect.' },
  { icon: Scale, title: 'Human review', body: 'People review every published finding. Models assist the work; they do not decide it.' },
  { icon: Network, title: 'Traceability', body: 'Each conclusion links back to the sources and steps that produced it.' },
  { icon: Eye, title: 'Transparency', body: 'Our methods, taxonomy, and limitations are documented and public.' },
  { icon: Award, title: 'Contributor recognition', body: 'The people who do the work are credited, and their track record is visible.' },
];

const audiences = [
  'Researchers', 'Journalists', 'Educators', 'Students',
  'Policy analysts', 'Watchdog organizations', 'Civil society groups',
];

const principles = [
  ['Accuracy over speed', 'We would rather be right than first.'],
  ['Evidence over opinion', 'Claims are weighed against sources, not volume.'],
  ['Transparency over opacity', 'How we reach a conclusion is part of the conclusion.'],
  ['Accountability over anonymity', 'Findings carry the names of the people who stand behind them.'],
  ['Human judgment over blind automation', 'Automation surfaces patterns; humans make the calls.'],
];

export default async function AboutPage() {
  const cms = await cmsGet('about');
  if (cms) return <CmsBlocksView blocks={cms.blocks} />;
  return (
    <>
      <PageHeader
        eyebrow="About HSI"
        title="A public-interest intelligence platform."
        description="Human Signal Index helps researchers, journalists, and the public understand the narratives shaping society, with evidence and human review at every step."
      />

      {/* 1. What is HSI */}
      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-h4 font-semibold text-text-primary">What is Human Signal Index?</h2>
            <p className="text-body text-text-secondary">
              HSI is a public-interest platform for studying the narratives, claims, and movements that
              influence public life. It brings together signal collection, evidence review, and a network
              of contributors under one transparent process.
            </p>
            <p className="text-body text-text-secondary">
              The work runs as a pipeline. Public signals are collected and preserved. Evidence is gathered
              and checked. Trained reviewers assess each finding. Only then is a report published, with its
              full traceability intact so readers can follow the reasoning for themselves.
            </p>
          </div>
          <Card className="space-y-3">
            <h3 className="text-h6 font-semibold text-text-primary">The pipeline, briefly</h3>
            <ol className="space-y-2 text-body-sm text-text-secondary">
              <li>1. Collect and preserve public signals.</li>
              <li>2. Gather and verify supporting evidence.</li>
              <li>3. Review findings with trained people.</li>
              <li>4. Publish with a traceable evidence chain.</li>
            </ol>
          </Card>
        </div>
      </Section>

      {/* 2. Why HSI exists */}
      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2">
            <h2 className="text-h5 font-semibold text-text-primary">Why HSI exists</h2>
            <p className="text-body-sm text-text-secondary">
              Public conversation moves faster than the evidence behind it. Narratives spread across many
              platforms at once, often stripped of their origins. By the time a claim is widely believed,
              the trail back to its source has usually gone cold.
            </p>
          </Card>
          <Card className="space-y-2">
            <h2 className="text-h5 font-semibold text-text-primary">The gap we fill</h2>
            <p className="text-body-sm text-text-secondary">
              There is no shortage of opinion about what is happening. What is missing is structured,
              checkable evidence and a clear record of how conclusions were reached. HSI rebuilds that
              record so the public can hold claims, and the people who make them, to account.
            </p>
          </Card>
        </div>
      </Section>

      {/* 3. What makes HSI different */}
      <Section className="pt-0">
        <h2 className="mb-6 text-h4 font-semibold text-text-primary">What makes HSI different</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {differences.map((d) => {
            const Icon = d.icon;
            return (
              <Card key={d.title} interactive className="space-y-3">
                <Icon className="h-6 w-6 text-electric" />
                <h3 className="text-h6 font-semibold text-text-primary">{d.title}</h3>
                <p className="text-body-sm text-text-secondary">{d.body}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* 4. Who uses HSI */}
      <Section className="pt-0">
        <Card className="space-y-4">
          <h2 className="text-h5 font-semibold text-text-primary">Who uses HSI</h2>
          <p className="text-body-sm text-text-secondary">
            HSI is built for people who need to understand public narratives with rigor, not just react to them.
          </p>
          <div className="flex flex-wrap gap-2">
            {audiences.map((a) => (
              <span key={a} className="rounded-full border border-border bg-surface-2/50 px-3 py-1 text-caption font-medium text-text-secondary">
                {a}
              </span>
            ))}
          </div>
        </Card>
      </Section>

      {/* 5. Core principles */}
      <Section className="pt-0">
        <h2 className="mb-6 text-h4 font-semibold text-text-primary">Core principles</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {principles.map(([title, body]) => (
            <div key={title} className="rounded-card border border-border bg-surface-2/40 p-4">
              <h3 className="text-body-sm font-semibold text-text-primary">{title}</h3>
              <p className="mt-1 text-caption text-text-secondary">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 6. Mission statement */}
      <Section className="pt-0">
        <Card className="space-y-3 border-electric/30 bg-electric/5">
          <h2 className="text-h5 font-semibold text-text-primary">Our mission</h2>
          <p className="text-body text-text-secondary">
            We exist to make public narratives understandable and accountable. Our goal is a public record
            of analyzed signals that is accurate, traceable, and open to scrutiny, so that anyone can see
            not only what is being said, but where it came from and why it matters.
          </p>
          <p className="text-body-sm text-text-secondary">
            Read more on our <a href="/mission" className="font-semibold text-electric hover:text-white">mission page</a>.
          </p>
        </Card>
      </Section>
    </>
  );
}
