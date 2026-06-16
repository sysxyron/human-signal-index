import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { Compass, Users, ShieldCheck, Target } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Our Mission',
  description:
    'The long-term vision behind Human Signal Index: a public, evidence-first record of the narratives shaping society, built by a recognized contributor network.',
  alternates: { canonical: '/mission' },
};

const goals = [
  { icon: Target, title: 'Public-interest goals', body: 'Serve the public, not a client list. Our analysis exists to inform researchers, journalists, educators, and citizens.' },
  { icon: ShieldCheck, title: 'Evidence-first philosophy', body: 'Every conclusion rests on a verifiable evidence chain. If we cannot trace it, we do not publish it.' },
  { icon: Users, title: 'A contributor model', body: 'The work is done by a network of reviewers and researchers whose contributions are credited and whose track record is visible.' },
  { icon: Compass, title: 'A long-term vision', body: 'A durable, open record of analyzed narratives that institutions and the public can rely on over time.' },
];

export default function MissionPage() {
  return (
    <>
      <PageHeader
        eyebrow="Our Mission"
        title="Make public narratives understandable and accountable."
        description="HSI exists to rebuild the link between what is said in public and the evidence behind it, so the people who shape opinion can be held to account."
      />

      <Section>
        <Card className="space-y-3">
          <h2 className="text-h5 font-semibold text-text-primary">The vision</h2>
          <p className="text-body text-text-secondary">
            Influence now travels faster than the evidence behind it. Claims spread across platforms in
            hours, and the trail back to their source often disappears. We believe the public deserves a
            record that does not. Our long-term aim is a trusted, open archive of analyzed signals, where
            each report carries its sources, its reasoning, and the names of the people who reviewed it.
          </p>
          <p className="text-body text-text-secondary">
            This is patient work. We measure success in accuracy and traceability, not in volume or speed.
            A smaller number of well-evidenced findings is worth far more than a flood of unverified ones.
          </p>
        </Card>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-6 text-h4 font-semibold text-text-primary">What we are working toward</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {goals.map((g) => {
            const Icon = g.icon;
            return (
              <Card key={g.title} className="space-y-3">
                <Icon className="h-6 w-6 text-electric" />
                <h3 className="text-h6 font-semibold text-text-primary">{g.title}</h3>
                <p className="text-body-sm text-text-secondary">{g.body}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="space-y-3 border-electric/30 bg-electric/5">
          <h2 className="text-h5 font-semibold text-text-primary">How you can take part</h2>
          <p className="text-body-sm text-text-secondary">
            HSI grows through people who care about getting the record right. You can submit a public
            signal for review, follow published reports, or apply to join the contributor network as your
            track record builds. Learn more on the <a href="/about" className="font-semibold text-electric hover:text-white">About page</a>.
          </p>
        </Card>
      </Section>
    </>
  );
}
