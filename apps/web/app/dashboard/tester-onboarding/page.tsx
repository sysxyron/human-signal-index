// =============================================================================
// HSI Phase 23 — Tester Onboarding (/dashboard/tester-onboarding). Server
// Component. Open to ANY signed-in tester. Static onboarding portal: about HSI,
// what to test, what NOT to test, bug-severity definitions, privacy + governance
// notices. No data, no actions — purely informational.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import Link from 'next/link';
import {
  GraduationCap, Compass, CheckCircle2, XCircle, Bug, ShieldCheck, Lock, Scale, ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function Section({ icon: Icon, title, children }: { icon: typeof Compass; title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 border-border" padded>
      <h3 className="flex items-center gap-2 text-h6 font-semibold text-text-primary"><Icon className="h-4 w-4 text-electric" /> {title}</h3>
      {children}
    </Card>
  );
}

const TEST_AREAS = [
  ['Navigation', 'Every sidebar item, tab, and CTA opens the right page; nothing dead.'],
  ['RBAC', 'Your role only opens what it should; restricted routes explain why.'],
  ['Publishing', 'Draft a report; confirm it stays a draft pending human approval.'],
  ['Research', 'Browse investigations, evidence, and research runs.'],
  ['Forecasting', 'Forecasts, scenarios, and early warnings render and explain themselves.'],
  ['Executive Intelligence', 'Command center, priorities, risks, opportunities, briefings.'],
  ['WorldForge', 'Simulations, scenarios, timelines, provenance.'],
];

const DONT = [
  'Production attacks, exploitation attempts, or penetration testing.',
  'Rate-limit / load / stress testing against the live service.',
  'Sharing your credentials or testing with another person’s account.',
  'Uploading real sensitive personal data.',
];

const SEVERITY = [
  ['Critical', '#EF4444', 'Data loss, security exposure, or the platform is unusable.'],
  ['High', '#F59E0B', 'A major feature is broken with no workaround.'],
  ['Medium', '#3B82F6', 'A feature is impaired but a workaround exists.'],
  ['Low', '#94A3B8', 'Cosmetic or minor; no functional impact.'],
];

export default function TesterOnboardingPage() {
  return (
    <>
      <TopNav title="Tester Onboarding" subtitle="Welcome to the Human Signal Index beta" />
      <main className="space-y-6 p-5 lg:p-6">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-h5 font-semibold text-text-primary"><GraduationCap className="h-5 w-5 text-electric" /> Beta tester guide</h2>
        </div>

        <Section icon={Compass} title="About HSI">
          <p className="text-caption leading-relaxed text-text-secondary">
            The Human Signal Index is a public-interest intelligence platform that maps the narratives shaping the
            information environment — with traceability, evidence, and <span className="font-semibold text-text-primary">human review at every step</span>.
            It spans signal capture, evidence, research orchestration, forecasting, collective consensus, publishing, and an
            executive command layer. You’re helping us validate it before public beta.
          </p>
        </Section>

        <Section icon={CheckCircle2} title="What to test">
          <ul className="space-y-1.5">
            {TEST_AREAS.map(([k, v]) => (
              <li key={k} className="flex gap-2 text-caption"><span className="text-verified">✓</span><span className="text-text-secondary"><span className="font-semibold text-text-primary">{k}:</span> {v}</span></li>
            ))}
          </ul>
        </Section>

        <Section icon={XCircle} title="What NOT to test">
          <ul className="space-y-1.5">
            {DONT.map((d) => (
              <li key={d} className="flex gap-2 text-caption"><span className="text-risk">✕</span><span className="text-text-secondary">{d}</span></li>
            ))}
          </ul>
        </Section>

        <Section icon={Bug} title="Reporting bugs">
          <p className="text-caption text-text-secondary">Use the <Link href={'/dashboard/launch/issues' as never} className="font-semibold text-electric hover:text-white">Beta Issue System <ArrowRight className="inline h-3 w-3" /></Link> and pick a severity:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SEVERITY.map(([label, color, desc]) => (
              <div key={label} className="flex items-start gap-2 rounded-card border border-border bg-surface/50 p-2.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <div><div className="text-caption font-semibold text-text-primary">{label}</div><div className="text-label text-text-muted">{desc}</div></div>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section icon={Lock} title="Privacy notice">
            <p className="text-caption leading-relaxed text-text-secondary">
              This is a controlled beta. Don’t enter real personal or confidential data. Your activity may be logged for
              quality and security (audit logs, access telemetry). We do not sell data. Sign-in identity is handled by Supabase
              Auth; your role is read from the database (`user_roles → roles`).
            </p>
          </Section>
          <Section icon={Scale} title="Governance notice">
            <div className="space-y-1.5 text-caption text-text-secondary">
              <p className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-verified" /> HSI is <span className="font-semibold text-text-primary">human governed</span>.</p>
              <ul className="space-y-0.5 pl-5">
                <li className="list-disc">No automated publication.</li>
                <li className="list-disc">No automated enforcement.</li>
                <li className="list-disc">No automated moderation actions.</li>
              </ul>
              <p>Every consequential decision requires a human reviewer and is auditable and reversible.</p>
            </div>
          </Section>
        </div>
      </main>
    </>
  );
}
