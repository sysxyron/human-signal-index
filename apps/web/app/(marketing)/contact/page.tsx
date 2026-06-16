import { PageHeader, Section } from '../../../components/page-header';
import { Card, Button, Input, Select, Textarea } from '@hsi/ui';
import type { Metadata } from 'next';
import { Mail, Newspaper, Shield, GraduationCap } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Reach Human Signal Index: press and media, security disclosure, and research or education collaborations.',
  alternates: { canonical: '/contact' },
};

const channels = [
  { icon: Newspaper, title: 'Press & media', body: 'For interviews, data requests, and editorial inquiries.', email: 'press@humansignalindex.org' },
  { icon: Shield, title: 'Security disclosure', body: 'Report a vulnerability through our responsible-disclosure channel.', email: 'security@humansignalindex.org' },
  { icon: GraduationCap, title: 'Research & education', body: 'Collaborations, datasets, and classroom resources.', email: 'research@humansignalindex.org' },
];

import { getPublishedPage as cmsGet } from '@/lib/cms/cms';
import { CmsBlocks as CmsBlocksView } from '@/components/cms/CmsBlocks';
export default async function ContactPage() {
  const cms = await cmsGet('contact');
  if (cms) return <CmsBlocksView blocks={cms.blocks} />;
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Get in touch with the observatory."
        description="Journalists, researchers, educators, and members of the public are all welcome to reach out. Choose the channel that fits your request, or send a general message below."
      />

      <Section>
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <Card className="space-y-5">
            <h2 className="text-h5 font-semibold text-text-primary">Send a message</h2>
            <form className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Name" placeholder="Your name" id="c-name" />
                <Input label="Email" type="email" placeholder="you@example.com" id="c-email" />
              </div>
              <Select label="Topic" id="c-topic" defaultValue="">
                <option value="" disabled>
                  Select a topic
                </option>
                <option>General inquiry</option>
                <option>Press & media</option>
                <option>Research collaboration</option>
                <option>Report a concern</option>
                <option>Security disclosure</option>
              </Select>
              <Textarea label="Message" rows={5} placeholder="How can we help?" id="c-msg" />
              <div className="flex justify-end">
                <Button variant="primary" type="submit">
                  <Mail className="h-4 w-4" /> Send message
                </Button>
              </div>
            </form>
          </Card>

          <div className="space-y-4">
            {channels.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.title} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric/15 text-electric">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="text-body-sm font-semibold text-text-primary">
                      {c.title}
                    </h3>
                  </div>
                  <p className="text-caption text-text-secondary">{c.body}</p>
                  <a
                    href={`mailto:${c.email}`}
                    className="text-caption font-semibold text-electric hover:text-white"
                  >
                    {c.email}
                  </a>
                </Card>
              );
            })}
          </div>
        </div>
      </Section>
    </>
  );
}
