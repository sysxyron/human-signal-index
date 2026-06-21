// =============================================================================
// HSI Phase 73.1 — Beta tester recruitment (/beta). PUBLIC marketing page.
// Converts visitors into beta testers. Reuses the HSI design system + the
// placeholder /api/beta/apply backend. Evidence-first, no overclaiming.
// =============================================================================

import type { Metadata } from 'next';
import { Card, Button, SectionEyebrow } from '@hsi/ui';
import { PageHeader, Section } from '../../../components/page-header';
import { appHref } from '@/lib/env/app-url';
import { getRuntimeFlag } from '@/lib/hsi/edge-config';
import { BetaForm } from '@/components/marketing/BetaForm';
import {
  ArrowRight, Radio, Link2, ScanText, Gauge, FileText, ShieldCheck, Microscope, Newspaper, Landmark,
  Users, GraduationCap, Eye, Megaphone, CheckCircle2, LogIn,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Human Signal Index Beta | Help Test an Intelligence & Trust Analysis Platform',
  description:
    'Apply to test Human Signal Index, a public-source intelligence and trust analysis platform built for evidence trails, provenance, investigations, forecasting, and transparent publishing.',
  alternates: { canonical: '/beta' },
  openGraph: {
    title: 'Human Signal Index Beta',
    description: 'Apply to test a public-source intelligence & trust analysis platform — evidence trails, provenance, investigations, forecasting, transparent publishing.',
    url: '/beta', type: 'website',
  },
};

const WHAT = [
  { icon: Radio, title: 'Collect public-source signals', body: 'Add sources and capture public narratives and open-source evidence. Everything is human-reviewed and nothing is auto-published.' },
  { icon: Link2, title: 'Trace every claim', body: 'Each finding links back to its original passage and timestamp, with a provenance record you can verify.' },
  { icon: ScanText, title: 'Investigate and build narratives', body: 'Cluster related claims, evidence, and sources into narratives over a real relationship graph.' },
  { icon: Gauge, title: 'Forecast with accountability', body: 'Record forecasts and track their outcomes. Accuracy is measured, not assumed.' },
  { icon: FileText, title: 'Publish transparently', body: 'Reports carry their citations; corrections are tracked openly.' },
  { icon: ShieldCheck, title: 'Reviewer in the loop', body: 'Every published conclusion passes human review. Nothing is a black box.' },
];

const TESTERS = [
  { icon: Microscope, label: 'Researchers' }, { icon: Eye, label: 'OSINT analysts' }, { icon: Newspaper, label: 'Journalists' },
  { icon: Landmark, label: 'Policy watchers' }, { icon: ShieldCheck, label: 'Trust & safety teams' }, { icon: Users, label: 'Nonprofit investigators' },
  { icon: GraduationCap, label: 'Academic researchers' }, { icon: Microscope, label: 'Public-interest researchers' }, { icon: Megaphone, label: 'Mis/disinformation analysts' },
  { icon: Eye, label: 'Extremism / ideology monitoring' }, { icon: Gauge, label: 'Forecasting & public-trust researchers' },
];

const WILL_DO = [
  'Add sources and create signals', 'Review evidence and provenance', 'Test dashboards and workflows',
  'Test source collection & provenance features', 'Test investigations, narratives, alerts, maps, and reporting',
  'Report bugs and give workflow feedback',
];

const GET = [
  'Early access before public launch', 'Founding tester recognition', 'A real voice in the roadmap',
  'Possible future discounted access', 'Access to HSI before it is generally available',
];

const TRUST = [
  'Public-source focused, built around open and citable evidence.', 'Evidence-first design, so claims trace back to their passages.',
  'No hidden trust scoring. The methods are explainable.', 'Provenance tracking on every source and signal.',
  'Corrections are tracked, not quietly edited.', 'Forecast accountability, with outcomes measured against reality.',
  'Your beta feedback is protected.',
];

export default async function BetaPage() {
  const betaSignupOpen = await getRuntimeFlag('betaSignupOpen');
  return (
    <main className="text-text-primary">
      <PageHeader
        eyebrow="Beta program"
        title="Help test a new intelligence & trust analysis platform"
        description="Human Signal Index helps researchers, analysts, journalists, and organizations collect, verify, investigate, forecast, and publish public-source intelligence with evidence trails."
      >
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="#apply"><Button variant="primary" size="lg">Apply to Beta Test <ArrowRight className="h-4 w-4" /></Button></a>
          <a href="/demo"><Button variant="secondary" size="lg">Request a Demo</Button></a>
        </div>
      </PageHeader>

      {/* What HSI does */}
      <Section>
        <div className="mb-8 max-w-2xl space-y-2"><SectionEyebrow>What HSI does</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Evidence-backed, human-reviewed, provenance-aware.</h2></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {WHAT.map((f) => { const Icon = f.icon; return (
            <Card key={f.title} className="space-y-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric"><Icon className="h-5 w-5" /></span>
              <h3 className="text-h6 font-semibold">{f.title}</h3>
              <p className="text-body-sm text-text-secondary">{f.body}</p>
            </Card>
          ); })}
        </div>
      </Section>

      {/* Who should test it */}
      <Section className="pt-0">
        <div className="mb-8 max-w-2xl space-y-2"><SectionEyebrow>Who should test it</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Built for the people who hold narratives to account.</h2></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TESTERS.map((t) => { const Icon = t.icon; return (
            <div key={t.label} className="flex items-center gap-2 rounded-card border border-border bg-surface/50 px-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-text-muted" /><span className="text-body-sm font-medium text-text-secondary">{t.label}</span>
            </div>
          ); })}
        </div>
      </Section>

      {/* What testers will do + get */}
      <Section className="pt-0">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="text-h5 font-semibold">What beta testers will do</h2>
            <ul className="space-y-2.5">{WILL_DO.map((w) => <li key={w} className="flex items-start gap-2.5 text-body-sm text-text-secondary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-electric" />{w}</li>)}</ul>
          </Card>
          <Card className="space-y-4">
            <h2 className="text-h5 font-semibold">What testers get</h2>
            <ul className="space-y-2.5">{GET.map((g) => <li key={g} className="flex items-start gap-2.5 text-body-sm text-text-secondary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verified" />{g}</li>)}</ul>
          </Card>
        </div>
      </Section>

      {/* Trust / privacy / evidence-first */}
      <Section className="pt-0">
        <Card className="space-y-4">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-electric" /><h2 className="text-h5 font-semibold">Trust, privacy & evidence-first by design</h2></div>
          <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {TRUST.map((t) => <p key={t} className="flex items-start gap-2.5 text-body-sm text-text-secondary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verified" />{t}</p>)}
          </div>
        </Card>
      </Section>

      {/* Application form */}
      <Section className="pt-0">
        <div id="apply" className="scroll-mt-24" />
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Apply</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Apply to beta test HSI</h2><p className="text-body-lg text-text-secondary">Tell us a little about your work. We review applications in batches.</p></div>
        {betaSignupOpen ? (
          <Card className="max-w-3xl"><BetaForm /></Card>
        ) : (
          <Card className="max-w-3xl space-y-2">
            <h3 className="text-h6 font-semibold text-text-primary">Beta applications are temporarily paused</h3>
            <p className="text-body-sm text-text-secondary">We&apos;re not accepting new beta applications right now. Please check back soon, or request a demo if you represent an organization.</p>
            <div className="flex flex-wrap gap-3 pt-1"><a href="/demo"><Button variant="secondary">Request a Demo</Button></a><a href="/docs"><Button variant="ghost">Documentation</Button></a></div>
          </Card>
        )}
      </Section>

      {/* App login + cross links */}
      <Section className="pt-0">
        <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1"><h3 className="text-h6 font-semibold">Already a tester?</h3><p className="text-body-sm text-text-secondary">Sign in to the product to pick up where you left off.</p></div>
          <div className="flex flex-wrap gap-3">
            <a href="/docs"><Button variant="ghost">Documentation</Button></a>
            <a href="/demo"><Button variant="secondary">Request a Demo</Button></a>
            <a href={appHref('/sign-in')}><Button variant="primary"><LogIn className="h-4 w-4" /> Sign in to the app</Button></a>
          </div>
        </Card>
      </Section>
    </main>
  );
}
