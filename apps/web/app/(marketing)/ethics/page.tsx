import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { Scale, UserX, ShieldOff, HeartHandshake, Ban, Eye } from 'lucide-react';

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Ethics',
  description:
    'The ethical guardrails Human Signal Index works within: public-only analysis, no targeting of individuals, proportionality, and public accountability.',
  alternates: { canonical: '/ethics' },
};

const principles = [
  { icon: Eye, title: 'Public, not private', body: 'We analyze public narratives and patterns, never private communications or individuals.' },
  { icon: UserX, title: 'No targeting of people', body: 'We do not build profiles of, dox, or facilitate harassment of any individual.' },
  { icon: ShieldOff, title: 'No amplification of harm', body: 'We never republish harmful content in ways that extend its reach.' },
  { icon: Scale, title: 'Proportionality', body: 'Our response is calibrated to genuine public-interest risk, not engagement.' },
  { icon: Ban, title: 'No political instrumentation', body: 'HSI is not a tool for any party, campaign, or government to silence opponents.' },
  { icon: HeartHandshake, title: 'Humanity above all', body: 'When in doubt, we err on the side of human dignity and the public good.' },
];

import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { CmsBlocks as CmsBlocksView } from '@/components/cms/CmsBlocks';
export default async function EthicsPage() {
  const cms = await cmsGet('ethics');
  if (cms) return <CmsBlocksView blocks={cms.blocks} />;
  return (
    <>
      <PageHeader
        eyebrow="Ethics"
        title="Powerful analysis demands strict guardrails."
        description="Signal intelligence can be misused. These are the lines HSI does not cross, and how we hold ourselves accountable."
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} interactive className="space-y-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="text-h6 font-semibold text-text-primary">{p.title}</h2>
                <p className="text-body-sm text-text-secondary">{p.body}</p>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="border-accent/30 bg-accent/5">
          <h2 className="text-h5 font-semibold text-text-primary">Accountability</h2>
          <p className="mt-2 text-body text-text-secondary">
            An independent ethics review board evaluates contested findings and
            policy decisions. Anyone can challenge a published conclusion, and we
            commit to responding transparently, including public corrections when
            we are wrong.
          </p>
        </Card>
      </Section>
    </>
  );
}
