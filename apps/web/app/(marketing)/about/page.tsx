import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import {
  ShieldCheck, Eye, Network, Scale, Award, Database, SearchCheck,
  UserCheck, FileText, Users, Gavel, ArrowRight,
} from 'lucide-react';
import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { resolveBespokeContent } from '@/lib/cms/bespoke';
import { cmsSeoToMetadata, type CmsSeo } from '@/lib/cms/seo';

const ABOUT_SEO_FALLBACK = {
  title: 'About',
  description:
    'Human Signal Index is a public-interest intelligence platform that collects public signals, reviews evidence, and publishes traceable, human-reviewed analysis built by a recognized contributor network.',
  path: '/about',
};

// Phase 41B.3 (E): CMS SEO (when the About page is published in the CMS) overrides
// these defaults; otherwise the hardcoded fallback metadata is used.
export async function generateMetadata(): Promise<Metadata> {
  const cms = await cmsGet('about');
  return cmsSeoToMetadata(cms?.seo as CmsSeo | undefined, ABOUT_SEO_FALLBACK);
}

const pipeline = [
  { icon: Database, title: 'Collect', body: 'Public signals are gathered and preserved, with their source and capture time recorded.' },
  { icon: SearchCheck, title: 'Verify evidence', body: 'Supporting evidence is gathered, checked, and archived so it can be inspected later.' },
  { icon: UserCheck, title: 'Human review', body: 'Trained reviewers assess each finding, weigh competing explanations, and document the reasoning.' },
  { icon: FileText, title: 'Publish', body: 'Only findings with a complete evidence chain are published, and they keep their full traceability.' },
];

const differences = [
  { icon: ShieldCheck, title: 'Evidence first', body: 'Nothing is published without a verifiable evidence chain anyone can inspect.' },
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
  ['Evidence over assertion', 'Claims are weighed against sources, not volume or confidence.'],
  ['Transparency over opacity', 'How we reach a conclusion is part of the conclusion.'],
  ['Accountability over authority', 'A finding stands on its evidence, not on who stated it.'],
  ['Human review over automation', 'Automation surfaces patterns; people make the published call.'],
  ['Correction over permanence', 'When we are wrong, we correct the record and keep the change visible.'],
];

const ladder = ['Viewer', 'Contributor', 'Researcher', 'Reviewer', 'Curator'];

export default async function AboutPage() {
  // Platform-owned page: the template ALWAYS renders. CMS may only fill approved
  // slots (hero heading/subheading); generic blocks never replace this layout.
  const cms = await cmsGet('about');
  const { slots } = resolveBespokeContent('about', cms);
  return (
    <>
      <PageHeader
        eyebrow="About HSI"
        title={slots.heroHeading ?? 'A public-interest intelligence platform.'}
        description={slots.heroSubheading ?? 'Human Signal Index helps researchers, journalists, and the public understand the narratives shaping society, with evidence and human review at every step.'}
      />

      {/* 1. What HSI Is */}
      <Section>
        <div className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-h4 font-semibold text-text-primary">What HSI is</h2>
            <p className="text-body text-text-secondary">
              Human Signal Index is a public-interest platform for studying the narratives, claims, and
              movements that influence public life. It brings together signal collection, evidence review,
              and a network of trained contributors under one transparent process.
            </p>
            <p className="text-body text-text-secondary">
              HSI is not a content-moderation tool, a surveillance system, or a political instrument. It
              studies public rhetoric and influence at the level of narratives and patterns, with strict
              guardrails against targeting private individuals.
            </p>
          </div>
          <Card className="space-y-3">
            <h3 className="text-h6 font-semibold text-text-primary">In one sentence</h3>
            <p className="text-body-sm text-text-secondary">
              A traceable, human-reviewed public record of the signals shaping opinion, so anyone can see
              not just what is being said, but where it came from and why it matters.
            </p>
          </Card>
        </div>
      </Section>

      {/* 2. Why It Exists */}
      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2">
            <h2 className="text-h5 font-semibold text-text-primary">Why it exists</h2>
            <p className="text-body-sm text-text-secondary">
              Public conversation moves faster than the evidence behind it. Information arrives in volume,
              narratives fragment across platforms, and claims are often stripped of their origins. By the
              time something is widely believed, the trail back to its source has usually gone cold.
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

      {/* 3. How It Works */}
      <Section className="pt-0">
        <h2 className="mb-6 text-h4 font-semibold text-text-primary">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pipeline.map((p, i) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Icon className="h-6 w-6 text-electric" />
                  <span className="text-caption font-bold text-text-muted">Step {i + 1}</span>
                </div>
                <h3 className="text-h6 font-semibold text-text-primary">{p.title}</h3>
                <p className="text-body-sm text-text-secondary">{p.body}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      {/* 4. Who It Serves */}
      <Section className="pt-0">
        <Card className="space-y-4">
          <h2 className="text-h5 font-semibold text-text-primary">Who it serves</h2>
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

      {/* 5. What Makes It Different */}
      <Section className="pt-0">
        <h2 className="mb-6 text-h4 font-semibold text-text-primary">What makes it different</h2>
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

      {/* 6. Core Principles */}
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

      {/* 7. Governance */}
      <Section className="pt-0">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Gavel className="h-6 w-6 text-electric" />
              <h2 className="text-h4 font-semibold text-text-primary">Governance</h2>
            </div>
            <p className="text-body text-text-secondary">
              Authority on the platform is earned and reviewed, never assumed. Reviews, approvals, and
              changes are written to an audit log that records who acted, when, and why, and decisions can
              be reversed. Contested findings can be escalated for independent review.
            </p>
          </div>
          <Card className="space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">Accountability in practice</h3>
            <ul className="space-y-1.5 text-body-sm text-text-secondary">
              <li>A report stays a draft until a human reviewer approves it.</li>
              <li>Anyone can challenge a published conclusion.</li>
              <li>Corrections and retractions are published with the reason and stay visible.</li>
              <li>Model versions and methods are recorded so findings can be reproduced.</li>
            </ul>
          </Card>
        </div>
      </Section>

      {/* 8. Contributor Model */}
      <Section className="pt-0">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-electric" />
            <h2 className="text-h5 font-semibold text-text-primary">Contributor model</h2>
          </div>
          <p className="text-body-sm text-text-secondary">
            The work is done by a community of contributors whose roles reflect demonstrated trust. New
            members start as viewers and can apply to take on more responsibility as their track record
            grows. Badges and reputation can unlock eligibility, but advanced roles are always granted by
            human approval, never automatically.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {ladder.map((r, i) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span className="rounded-full border border-border bg-surface-2/50 px-3 py-1 text-caption font-medium text-text-secondary">{r}</span>
                {i < ladder.length - 1 ? <ArrowRight className="h-3 w-3 text-text-muted" /> : null}
              </span>
            ))}
          </div>
        </Card>
      </Section>

      {/* 9. Mission */}
      <Section className="pt-0">
        <Card className="space-y-3 border-electric/30 bg-electric/5">
          <h2 className="text-h5 font-semibold text-text-primary">Our mission</h2>
          <p className="text-body text-text-secondary">
            We exist to make public narratives understandable and accountable. Our goal is a public record
            of analyzed signals that is accurate, traceable, and open to scrutiny, so that anyone can see
            not only what is being said, but where it came from and why it matters.
          </p>
          <p className="text-body-sm text-text-secondary">
            Read the full <a href="/mission" className="font-semibold text-electric hover:text-white">mission statement</a>.
          </p>
        </Card>
      </Section>
    </>
  );
}
