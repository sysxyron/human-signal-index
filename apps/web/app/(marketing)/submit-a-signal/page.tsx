import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { ShieldCheck, Lock, Eye } from 'lucide-react';
import { SignalSubmitForm } from '@/components/signals/SignalSubmitForm';

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Submit a Signal',
  description:
    'Share a public signal for review by Human Signal Index. Every submission is assessed by a trained reviewer.',
  alternates: { canonical: '/submit-a-signal' },
};

const assurances = [
  { icon: ShieldCheck, title: 'Human-reviewed', body: 'Every submission is evaluated by a trained reviewer.' },
  { icon: Lock, title: 'Source-protective', body: 'We never publish submitter identities without consent.' },
  { icon: Eye, title: 'Public-interest only', body: 'We analyze public narratives, not private individuals.' },
];

export default function SubmitSignalPage() {
  return (
    <>
      <PageHeader
        eyebrow="Submit a Signal"
        title="Spotted a narrative worth investigating?"
        description="Share a public signal for review. The more context and evidence you provide, the faster we can trace and assess it."
      />

      <Section>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <SignalSubmitForm />

          <div className="space-y-4">
            {assurances.map((a) => {
              const Icon = a.icon;
              return (
                <Card key={a.title} className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-verified/15 text-verified">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-body-sm font-semibold text-text-primary">
                      {a.title}
                    </h3>
                    <p className="mt-0.5 text-caption text-text-secondary">{a.body}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </Section>
    </>
  );
}
