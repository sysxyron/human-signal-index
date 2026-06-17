import Link from 'next/link';
import { PageHeader, Section } from '../../../components/page-header';
import { Card } from '@hsi/ui';
import {
  ShieldCheck, Users, FileSearch, ScrollText, BookCheck, Lock, UserCheck, Eye, ArrowRight,
} from 'lucide-react';
import { getTrustData } from '@/lib/trust-intelligence';
import {
  TrustOverview, TransparencyScorecard, ReviewPipeline, CorrectionsCenter,
  SourceAccountability, DecisionExplainability, PlatformHealth, AuditTimeline,
} from '@/components/trust-center/panels';
import { TraceabilityExplainer } from '@/components/trust-center/TraceabilityExplainer';

export const metadata = { title: 'Trust & Transparency' };
export const revalidate = 120;

const principles = [
  { icon: Users, title: 'People make the decisions', body: 'No finding is published, no account is restricted, and no enforcement happens automatically. A person reviews and decides every time.' },
  { icon: FileSearch, title: 'Everything can be traced', body: 'Each claim links back to the source it came from. You can follow a published finding all the way to the original evidence.' },
  { icon: ScrollText, title: 'Decisions are recorded', body: 'Reviews, approvals, and changes are written to an audit log with who acted, when, and why, and they can be reversed.' },
  { icon: BookCheck, title: 'Evidence comes first', body: 'We archive the underlying material and seal it with a hash so anyone can check it has not been altered.' },
];

const commitments = [
  { icon: BookCheck, title: 'Publication standards', body: 'A report stays a draft until a human reviewer approves it. We publish corrections, and the reason for them, when we get something wrong.' },
  { icon: Lock, title: 'Security commitments', body: 'Access is limited by role, sessions are protected, and we run a vulnerability disclosure program so researchers can report problems safely.' },
  { icon: UserCheck, title: 'Your rights', body: 'You can ask what data we hold about you and request a correction. We do not sell your data.' },
  { icon: Eye, title: 'Transparency', body: 'We document how the platform works, which model versions produced a result, and where we have made mistakes.' },
];

export default async function TrustPage() {
  const trust = await getTrustData();

  return (
    <>
      <PageHeader
        eyebrow="Trust & Transparency"
        title="Built to be checked, not just believed."
        description="The Human Signal Index maps narratives in the information environment. Because that work only matters if people can trust it, here is exactly how we operate — with live evidence — and how to hold us to it."
      />

      {/* ---- live trust center ---- */}
      <Section>
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">Trust at a glance</h2>
        <TrustOverview data={trust.overview} />
      </Section>

      <Section className="pt-0">
        <h2 className="mb-5 text-h5 font-semibold text-text-primary">Platform health</h2>
        <PlatformHealth data={trust.health} />
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-2">
          <TransparencyScorecard scores={trust.scorecard} />
          <ReviewPipeline stages={trust.pipeline} />
        </div>
      </Section>

      <Section className="pt-0">
        <TraceabilityExplainer />
      </Section>

      <Section className="pt-0">
        <div className="grid gap-4 lg:grid-cols-2">
          <CorrectionsCenter corrections={trust.corrections} />
          <SourceAccountability data={trust.sourceAccountability} />
        </div>
      </Section>

      <Section className="pt-0">
        <DecisionExplainability />
      </Section>

      <Section className="pt-0">
        <AuditTimeline items={trust.audit} />
      </Section>

      {/* ---- principles & commitments (narrative) ---- */}
      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">How we work</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {principles.map((p) => {
            const Icon = p.icon;
            return (
              <Card key={p.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric/15 text-electric"><Icon className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-h6 font-semibold text-text-primary">{p.title}</h3>
                  <p className="mt-1 text-body-sm text-text-secondary">{p.body}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <h2 className="mb-5 text-h4 font-semibold text-text-primary">Our commitments</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {commitments.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-verified/15 text-verified"><Icon className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-h6 font-semibold text-text-primary">{c.title}</h3>
                  <p className="mt-1 text-body-sm text-text-secondary">{c.body}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-2 text-h5 font-semibold text-text-primary">
            <ShieldCheck className="h-5 w-5 text-electric" /> Report a problem
          </div>
          <p className="text-body-sm text-text-secondary">
            Found a security flaw, or need to report misconduct? We have dedicated, confidential channels.
          </p>
          <div className="flex flex-wrap gap-3">
            <TrustLink href="/security/vulnerability-disclosure" label="Vulnerability disclosure" />
            <TrustLink href="/security/responsible-disclosure" label="Responsible disclosure" />
            <TrustLink href="/whistleblower" label="Whistleblower center" />
            <TrustLink href="/report-confidentially" label="Report confidentially" />
            <TrustLink href="/security-awareness" label="Security awareness" />
          </div>
        </Card>
      </Section>
    </>
  );
}

function TrustLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as never} className="inline-flex items-center gap-1.5 rounded-btn border border-border px-3.5 py-2 text-caption font-semibold text-text-secondary transition hover:border-electric hover:text-white">
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
