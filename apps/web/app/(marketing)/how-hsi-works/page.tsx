// =============================================================================
// HSI Phase 73.4 — How HSI Works (/how-hsi-works). Public. A simple visual
// explanation for first-time visitors: Collect → Verify → Investigate →
// Forecast → Publish → Audit. Reuses the marketing design system.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card, Button, SectionEyebrow } from '@hsi/ui';
import { Radio, ShieldCheck, Search, Target, FileText, Gauge, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'How HSI Works',
  description: 'A simple overview of how Human Signal Index works: collect public sources, verify with evidence, investigate, forecast, publish with citations, and audit.',
  keywords: ['how HSI works', 'open-source intelligence', 'evidence', 'provenance', 'workflow'],
  alternates: { canonical: '/how-hsi-works' },
  openGraph: { title: 'How Human Signal Index Works', description: 'Collect, verify, investigate, forecast, publish, and audit — with evidence trails.', url: '/how-hsi-works', type: 'website' },
};

const STEPS = [
  { icon: Radio, title: 'Collect', body: 'People add public sources. HSI captures signals from them. Nothing is collected without a human-added source.' },
  { icon: ShieldCheck, title: 'Verify', body: 'Evidence is attached to claims and linked back to the original passage, so each claim can be checked.' },
  { icon: Search, title: 'Investigate', body: 'Related signals, evidence, and sources are organized into investigations and narratives.' },
  { icon: Target, title: 'Forecast', body: 'Where useful, forecasts are recorded with a resolution date and later scored against what actually happened.' },
  { icon: FileText, title: 'Publish', body: 'Reviewed findings are published with their citations. Corrections are tracked openly.' },
  { icon: Gauge, title: 'Audit', body: 'Sources, evidence, and forecast outcomes stay visible so the work can be reviewed and held to account.' },
];

export default function HowHsiWorksPage() {
  return (
    <main className="text-text-primary">
      <PageHeader eyebrow="How it works" title="How Human Signal Index works" description="HSI turns public sources into reviewed, traceable findings. Every step keeps a record back to the original source." />

      <Section>
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => { const Icon = s.icon; return (
            <li key={s.title}>
              <Card className="h-full space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric"><Icon className="h-5 w-5" /></span>
                  <span className="text-caption font-semibold text-text-muted">Step {i + 1}</span>
                </div>
                <h2 className="text-h6 font-semibold">{s.title}</h2>
                <p className="text-body-sm text-text-secondary">{s.body}</p>
              </Card>
            </li>
          ); })}
        </ol>
      </Section>

      <Section className="pt-0">
        <Card className="space-y-3">
          <SectionEyebrow>The throughline</SectionEyebrow>
          <p className="text-body-lg text-text-secondary">Source → Signal → Evidence → Narrative → Forecast → Review → Publication. Provenance is preserved at every step, so any published conclusion can be traced to the source passages behind it.</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a href="/docs/workflow"><Button variant="secondary">Read the full workflow <ArrowRight className="h-4 w-4" /></Button></a>
            <a href="/docs/concepts"><Button variant="ghost">Core concepts</Button></a>
          </div>
        </Card>
      </Section>

      <Section className="pt-0">
        <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1"><h3 className="text-h6 font-semibold">Want to go deeper?</h3><p className="text-body-sm text-text-secondary">Work through the Education Hub or read the methodology.</p></div>
          <div className="flex flex-wrap gap-3">
            <a href="/education-hub"><Button variant="secondary">Education Hub</Button></a>
            <a href="/docs/methodology"><Button variant="ghost">Methodology</Button></a>
          </div>
        </Card>
      </Section>
    </main>
  );
}
