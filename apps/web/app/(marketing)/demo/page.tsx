// =============================================================================
// HSI Phase 73.1 — Demo request (/demo). PUBLIC marketing page. Buyer/partner
// oriented — converts serious prospects into demo requests. Reuses the HSI design
// system + the placeholder /api/demo/request backend. Evidence-first, credible.
// =============================================================================

import type { Metadata } from 'next';
import { Card, Button, SectionEyebrow } from '@hsi/ui';
import { PageHeader, Section } from '../../../components/page-header';
import { appHref } from '@/lib/env/app-url';
import { DemoForm } from '@/components/marketing/DemoForm';
import {
  ArrowRight, Link2, ShieldCheck, FileText, Gauge, Eye, Newspaper, Landmark, Users,
  Microscope, Building2, Search, CheckCircle2, LogIn, GraduationCap as GraduationCapSafe,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Request a Human Signal Index Demo | Evidence-Backed Intelligence Workflows',
  description:
    'Request a demo of Human Signal Index for research teams, OSINT analysts, journalists, nonprofits, institutions, and organizations that need evidence-backed intelligence workflows.',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'Request a Human Signal Index Demo',
    description: 'Evidence-backed intelligence workflows for research teams, OSINT, newsrooms, nonprofits, and institutions.',
    url: '/demo', type: 'website',
  },
};

const BUILT_FOR = [
  { icon: Link2, title: 'Provenance you can defend', body: 'Every claim links to its source passage and timestamp, so findings hold up in review and in print.' },
  { icon: ShieldCheck, title: 'Human-reviewed by design', body: 'Reviewers stay in the loop on every published conclusion. Judgment is never automated away.' },
  { icon: Gauge, title: 'Forecasts held to account', body: 'Record predictions, track outcomes, and measure accuracy and calibration over time.' },
  { icon: FileText, title: 'Transparent publishing', body: 'Reports ship with citations, and corrections are tracked openly rather than edited quietly.' },
];

const USE_CASES = [
  'Open-source investigation & verification', 'Narrative & influence tracking', 'Trust & safety monitoring',
  'Editorial research with evidence trails', 'Policy & public-interest analysis', 'Forecasting with accountability',
];

const AUDIENCES = [
  { icon: Microscope, label: 'Research organizations' }, { icon: Eye, label: 'OSINT teams' }, { icon: Newspaper, label: 'Media / newsrooms' },
  { icon: Users, label: 'Nonprofits' }, { icon: Landmark, label: 'Policy organizations' }, { icon: ShieldCheck, label: 'Trust & safety teams' },
  { icon: GraduationCapSafe, label: 'Academic labs' }, { icon: Building2, label: 'Enterprise intelligence teams' }, { icon: Search, label: 'Investigative teams' },
];

const COVERS = [
  'A live walkthrough mapped to your workflows', 'Source collection, provenance, and evidence trails',
  'Investigations, narratives, alerts, and the intelligence map', 'Forecasting, transparency, and publishing',
  'Roles, review, and how human oversight works', 'Deployment, access, and next steps for a pilot',
];

export default function DemoPage() {
  return (
    <main className="text-text-primary">
      <PageHeader
        eyebrow="Request a demo"
        title="See how HSI supports evidence-backed intelligence workflows"
        description="A tailored walkthrough for teams that need provenance, human review, and accountable forecasting — not hype. We map the demo to your real work."
      >
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="#request"><Button variant="primary" size="lg">Request a Demo <ArrowRight className="h-4 w-4" /></Button></a>
          <a href="/beta"><Button variant="secondary" size="lg">Join the Beta</Button></a>
        </div>
      </PageHeader>

      {/* Built for teams */}
      <Section>
        <div className="mb-8 max-w-2xl space-y-2"><SectionEyebrow>Why teams choose HSI</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Built for teams that need evidence-backed intelligence workflows.</h2></div>
        <div className="grid gap-5 sm:grid-cols-2">
          {BUILT_FOR.map((f) => { const Icon = f.icon; return (
            <Card key={f.title} className="space-y-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/15 text-electric"><Icon className="h-5 w-5" /></span>
              <h3 className="text-h6 font-semibold">{f.title}</h3>
              <p className="text-body-sm text-text-secondary">{f.body}</p>
            </Card>
          ); })}
        </div>
      </Section>

      {/* Use cases */}
      <Section className="pt-0">
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Use cases</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Where HSI fits.</h2></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u) => <div key={u} className="flex items-start gap-2.5 rounded-card border border-border bg-surface/50 px-4 py-3 text-body-sm text-text-secondary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-electric" />{u}</div>)}
        </div>
      </Section>

      {/* Who it is for */}
      <Section className="pt-0">
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Who it is for</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Serious teams, serious evidence.</h2></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AUDIENCES.map((a) => { const Icon = a.icon; return (
            <div key={a.label} className="flex items-center gap-2 rounded-card border border-border bg-surface/50 px-3 py-2.5"><Icon className="h-4 w-4 shrink-0 text-text-muted" /><span className="text-body-sm font-medium text-text-secondary">{a.label}</span></div>
          ); })}
        </div>
      </Section>

      {/* What a demo covers */}
      <Section className="pt-0">
        <Card className="space-y-4">
          <h2 className="text-h5 font-semibold">What a demo covers</h2>
          <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {COVERS.map((c) => <p key={c} className="flex items-start gap-2.5 text-body-sm text-text-secondary"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verified" />{c}</p>)}
          </div>
        </Card>
      </Section>

      {/* Request form */}
      <Section className="pt-0">
        <div id="request" className="scroll-mt-24" />
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Request</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Request a demo</h2><p className="text-body-lg text-text-secondary">Tell us about your team and use case. We tailor every walkthrough.</p></div>
        <Card className="max-w-3xl"><DemoForm /></Card>
      </Section>

      {/* App login + cross links */}
      <Section className="pt-0">
        <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1"><h3 className="text-h6 font-semibold">Prefer to try it yourself first?</h3><p className="text-body-sm text-text-secondary">Join the beta, or sign in if you already have access.</p></div>
          <div className="flex flex-wrap gap-3">
            <a href="/docs"><Button variant="ghost">Documentation</Button></a>
            <a href="/beta"><Button variant="secondary">Join the Beta</Button></a>
            <a href={appHref('/sign-in')}><Button variant="primary"><LogIn className="h-4 w-4" /> Sign in to the app</Button></a>
          </div>
        </Card>
      </Section>
    </main>
  );
}
