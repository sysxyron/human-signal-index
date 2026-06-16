import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import { Megaphone, FileText, Lock, ShieldCheck, EyeOff, ArrowRight, AlertTriangle } from 'lucide-react';

import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Whistleblower Center',
  description:
    'Report wrongdoing safely to Human Signal Index: what you can report, how to protect yourself, and how we handle confidential submissions.',
  alternates: { canonical: '/whistleblower' },
};

const reportable = [
  'Corruption or fraud',
  'Abuse of power or misconduct',
  'Coordinated disinformation operations',
  'Security incidents',
  'Research misconduct',
  'Governance violations',
];

export default function WhistleblowerPage() {
  return (
    <>
      <PageHeader
        eyebrow="Whistleblower Center"
        title="Report wrongdoing safely."
        description="If you have seen something that needs to come to light, you can tell us. This page explains what to report, how to protect yourself, and how we handle what you send."
      />

      <Section>
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><Megaphone className="h-5 w-5 text-electric" /> What you can report</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {reportable.map((r) => (
              <div key={r} className="flex items-center gap-2 rounded-card border border-border bg-surface/50 px-3 py-2 text-body-sm text-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full bg-electric" /> {r}
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><FileText className="h-4 w-4 text-electric" /> Before you submit</h3>
            <ul className="ml-5 list-disc space-y-1 text-body-sm text-text-secondary">
              <li>Write down what happened, when, and who was involved.</li>
              <li>Be specific. Dates, places, and amounts help us act.</li>
              <li>Only include what you can share safely.</li>
            </ul>
          </Card>
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><FileText className="h-4 w-4 text-electric" /> Evidence</h3>
            <ul className="ml-5 list-disc space-y-1 text-body-sm text-text-secondary">
              <li>Documents, screenshots, or links are useful.</li>
              <li>Remove metadata from files before sending them.</li>
              <li>Do not break the law or your own safety to gather proof.</li>
            </ul>
          </Card>
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Lock className="h-4 w-4 text-electric" /> Privacy</h3>
            <p className="text-body-sm text-text-secondary">You decide how much to tell us about yourself. You can report without giving your name. If you do share contact details, we use them only to follow up on your report.</p>
          </Card>
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><EyeOff className="h-4 w-4 text-electric" /> Protecting yourself</h3>
            <p className="text-body-sm text-text-secondary">Submit from a personal device on a network you trust, not a work account. Avoid mentioning details that could identify you inside the report itself.</p>
          </Card>
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <p className="text-body-sm text-text-secondary">
            We take steps to protect sources and the information you send, but no online system can guarantee complete
            anonymity. Read the full notice before you submit.
          </p>
        </Card>
      </Section>

      <Section className="pt-0">
        <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><ShieldCheck className="h-5 w-5 text-verified" /> Ready to report?</div>
          <Link href={'/report-confidentially' as never} className="inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-caption font-semibold text-white transition hover:bg-[#1E56D6]">
            Report confidentially <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </Section>
    </>
  );
}
