import { PageHeader, Section } from '../../../components/page-header';
import { Card, MetricCard } from '@hsi/ui';
import { Target, Eye, Scale, Users, ShieldCheck, Globe } from 'lucide-react';

export const metadata = { title: 'About' };

const values = [
  { icon: ShieldCheck, title: 'Evidence first', body: 'No conclusion is published without an intact, verifiable evidence chain.' },
  { icon: Eye, title: 'Radical transparency', body: 'Our methods, taxonomy, and limitations are public and documented.' },
  { icon: Scale, title: 'Public interest', body: 'We analyze public narratives — never harass individuals or amplify private harms.' },
  { icon: Users, title: 'Human in the loop', body: 'People review every published finding. Models assist; they do not decide.' },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About HSI"
        title="A public-interest signal-intelligence observatory."
        description="HSI identifies, preserves, classifies, traces, and explains the public narratives and signals that shape human behavior — with provenance, transparency, and human review at every step."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Signals Analyzed" value="152,390" accent="#3B82F6" />
          <MetricCard label="Traceability Score" value="96.3%" accent="#10B981" />
          <MetricCard label="Public Reports" value="214" accent="#8B5CF6" />
        </div>
      </Section>

      <Section className="pt-0">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <Card className="space-y-3">
            <Target className="h-6 w-6 text-electric" />
            <h2 className="text-h5 font-semibold text-text-primary">Our mission</h2>
            <p className="text-body text-text-secondary">
              The narratives that move populations rarely arrive with their
              evidence attached. We exist to rebuild that chain — making it
              possible for researchers, journalists, educators, and the public to
              understand not just what is being said, but where it came from and
              why it matters.
            </p>
          </Card>
          <Card className="space-y-3">
            <Globe className="h-6 w-6 text-accent" />
            <h2 className="text-h5 font-semibold text-text-primary">What we are not</h2>
            <p className="text-body text-text-secondary">
              HSI is not a content-moderation tool, a surveillance system, or a
              political instrument. We study public rhetoric and influence at the
              level of narratives and patterns — with strict ethical guardrails
              against targeting private individuals.
            </p>
          </Card>
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-6 text-h4 font-semibold text-text-primary">Our principles</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((v) => {
            const Icon = v.icon;
            return (
              <Card key={v.title} interactive className="space-y-3">
                <Icon className="h-6 w-6 text-electric" />
                <h3 className="text-h6 font-semibold text-text-primary">{v.title}</h3>
                <p className="text-body-sm text-text-secondary">{v.body}</p>
              </Card>
            );
          })}
        </div>
      </Section>
    </>
  );
}
