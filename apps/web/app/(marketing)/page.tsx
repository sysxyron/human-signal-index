import { SectionEyebrow, Button, Card } from '@hsi/ui';
import {
  Radio, Link2, ScanText, Gauge, GraduationCap, ArrowRight, CheckCircle2,
  Newspaper, Microscope, Users, Landmark,
} from 'lucide-react';
import { appHref } from '@/lib/env/app-url';
import { AuthHashForwarder } from '@/components/auth/AuthHashForwarder';
import { getPublishedPage } from '@/lib/cms/cms';
import { resolveBespokeContent } from '@/lib/cms/bespoke';
import { getPublicIntelligenceAction } from '@/lib/publishing/actions';
import { formatDate } from '@/lib/signals/view';
import { HeroNetworkGlobe } from '@/components/home/HeroNetworkGlobe';
import { SignalTicker } from '@/components/home/SignalTicker';
import { AnimatedMetric, type MetricSpec } from '@/components/home/AnimatedMetric';
import { LiveSignalsFeed, type FeedItem } from '@/components/home/LiveSignalsFeed';
import { MissionControlPreview, type MissionControlData } from '@/components/home/MissionControlPreview';
import { TraceabilityPipeline } from '@/components/home/TraceabilityPipeline';
import { HumanInLoop } from '@/components/home/HumanInLoop';
import { EvidenceChain } from '@/components/home/EvidenceChain';
import { PlatformActivity } from '@/components/home/PlatformActivity';
import { Reveal, RevealGroup, RevealItem } from '@/components/home/motion';

// ---- Animated platform metrics (demo values; deltas drive the trend chips) ---
const METRICS: MetricSpec[] = [
  { label: 'Active Sources', value: 24781, format: 'count', accent: '#3B82F6', delta: 6.4, spark: [12, 18, 15, 22, 28, 26, 34] },
  { label: 'Signals Analyzed', value: 152390, format: 'count', accent: '#8B5CF6', delta: 9.1, spark: [40, 38, 52, 60, 58, 72, 88] },
  { label: 'Pending Reviews', value: 8432, format: 'count', accent: '#F59E0B', delta: -3.2, spark: [30, 28, 35, 32, 40, 38, 44] },
  { label: 'High-Risk Signals', value: 312, format: 'count', accent: '#EF4444', delta: 4.8, spark: [8, 10, 9, 14, 12, 18, 22] },
  { label: 'Traceability Score', value: 96.3, format: 'percent', accent: '#10B981', delta: 1.2, spark: [90, 91, 93, 92, 95, 95, 96] },
];

const FEATURES = [
  { icon: Radio, title: 'Collect Public Signals', description: 'Continuously capture public narratives, campaigns, and open-source evidence across platforms.', color: '#3B82F6' },
  { icon: Link2, title: 'Trace Everything', description: 'Link every finding back to the original passages and timestamps, with a record you can verify.', color: '#10B981' },
  { icon: ScanText, title: 'Analyze Rhetoric', description: 'Classify narratives with a structured taxonomy of rhetoric, framing, and influence.', color: '#8B5CF6' },
  { icon: Gauge, title: 'Score & Prioritize Risk', description: 'Assign clear risk levels that reviewers can act on, each with a plain explanation.', color: '#F59E0B' },
  { icon: GraduationCap, title: 'Educate & Empower', description: 'Produce reports, explainers, and counter-narratives the public can read and check.', color: '#EF4444' },
];

const WHY = [
  'Narratives move faster than facts, so we restore the evidence trail.',
  'Every claim is traceable back to a verifiable source passage.',
  'Human reviewers stay in the loop on every published conclusion.',
  'Risk scoring is explainable, not a black box.',
];

// Proof-point chips for the "Why It Matters" panel (keeps the column intentional).
const PROOF = [
  { value: '96.3%', label: 'Traceable', color: '#10B981' },
  { value: '100%', label: 'Human Reviewed', color: '#3B82F6' },
  { value: '24.7k', label: 'Sources', color: '#8B5CF6' },
];

const TRUSTED = [
  { icon: Microscope, label: 'Researchers' },
  { icon: Newspaper, label: 'Journalists' },
  { icon: GraduationCap, label: 'Educators' },
  { icon: Users, label: 'Concerned Citizens' },
  { icon: Landmark, label: 'Policy Analysts' },
];

const DEMO_FEED: FeedItem[] = [
  { title: 'Coordinated recruitment narrative across 4 platforms', category: 'Recruitment', time: '2m ago', risk: 5, tone: 'orange', demo: true },
  { title: 'Health misinformation cluster amplified by inauthentic accounts', category: 'Misinformation', time: '14m ago', risk: 4, tone: 'red', demo: true },
  { title: 'State-aligned influence operation signature', category: 'Influence', time: '38m ago', risk: 4, tone: 'purple', demo: true },
  { title: 'Election narrative seeding detected', category: 'Civic', time: '1h ago', risk: 3, tone: 'blue', demo: true },
  { title: 'Astroturfed product campaign', category: 'Astroturf', time: '2h ago', risk: 2, tone: 'orange', demo: true },
  { title: 'Benign viral trend flagged low-risk', category: 'Cultural', time: '3h ago', risk: 1, tone: 'green', demo: true },
];

const MISSION: MissionControlData = {
  series: [
    { name: 'Signals', color: '#3B82F6', data: [22, 30, 28, 42, 38, 55, 60, 72] },
    { name: 'High-risk', color: '#EF4444', data: [6, 9, 7, 14, 11, 18, 16, 24] },
  ],
  xLabels: ['8w', '7w', '6w', '5w', '4w', '3w', '2w', '1w'],
  donut: [
    { label: 'Low', value: 120, color: '#3B82F6' },
    { label: 'Moderate', value: 64, color: '#F59E0B' },
    { label: 'High', value: 28, color: '#EF4444' },
    { label: 'Critical', value: 6, color: '#B91C1C' },
  ],
  // Deterministic intensity matrix (no Math.random → no hydration drift).
  heat: Array.from({ length: 5 }, (_, r) => Array.from({ length: 12 }, (_, c) => Math.abs(Math.sin((r + 1) * 1.7 + (c + 1) * 0.9)))),
  heatCols: [],
  alerts: [
    { title: 'Narrative shift detected on a monitored source', severity: 'high' },
    { title: 'New high-risk recruitment cluster', severity: 'critical' },
    { title: 'Source health degraded: 2 feeds failing', severity: 'medium' },
    { title: 'Watchlist match: election integrity', severity: 'low' },
  ],
  traceability: 96.3,
};

const ACTIVITY: MetricSpec[] = [
  METRICS[0], METRICS[1], METRICS[2], METRICS[4],
];

export default async function HomePage() {
  // Platform-owned page (41B.3A): the flagship template ALWAYS renders. CMS may
  // only fill approved hero slots — generic blocks never replace this layout.
  const cms = await getPublishedPage('home');
  const { slots } = resolveBespokeContent('home', cms);

  // Live feed: real published intelligence when available, else seeded demo.
  const intel = await getPublicIntelligenceAction();
  const feed: FeedItem[] = intel.ok && intel.data.items.length > 0
    ? intel.data.items.slice(0, 6).map((it) => ({
        title: it.title,
        category: it.categories?.[0] ?? it.topics?.[0] ?? 'Intelligence',
        time: formatDate(it.publishedAt),
        tone: 'green' as const,
      }))
    : DEMO_FEED;

  return (
    <main className="text-text-primary">
      <AuthHashForwarder />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
        <div className="relative mx-auto grid max-w-page items-center gap-8 px-5 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1fr_1.08fr] lg:gap-12 lg:py-28">
          <div className="max-w-xl space-y-5 animate-fade-up sm:space-y-6">
            <SectionEyebrow>A Live Public-Interest Intelligence Network</SectionEyebrow>
            <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[44px] lg:text-h1">
              {slots.heroHeading ?? (
                <>
                  Mapping the Narratives That Shape{' '}
                  <span className="text-electric">Humanity.</span>
                </>
              )}
            </h1>
            <p className="text-body-lg text-text-secondary">
              {slots.heroSubheading ??
                'Human Signal Index captures public signals, traces the evidence, and publishes human-reviewed intelligence in real time, with traceability and transparency at every step.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={appHref('/dashboard')}><Button variant="primary" size="lg">Explore Live Signals <ArrowRight className="h-4 w-4" /></Button></a>
              <a href="/methodology"><Button variant="secondary" size="lg">Learn Our Methodology</Button></a>
            </div>
            <p className="text-body-sm text-text-muted">Evidence first. Traceability always. Humanity above all.</p>
          </div>
          <div className="relative flex min-h-[260px] items-center justify-center sm:min-h-[360px] lg:min-h-[540px] lg:justify-center">
            <HeroNetworkGlobe className="mx-auto w-full max-w-[330px] sm:max-w-[440px] lg:max-w-none" />
          </div>
        </div>

        {/* live signal ticker + animated metric strip */}
        <div className="relative mx-auto max-w-page space-y-4 px-5 pb-12 sm:px-6 sm:pb-16">
          <SignalTicker items={feed} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {METRICS.map((m) => <AnimatedMetric key={m.label} spec={m} />)}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-section px-6 py-16 lg:py-20">
        <Reveal>
          <div className="mb-10 max-w-2xl space-y-3">
            <SectionEyebrow>How It Works</SectionEyebrow>
            <h2 className="text-h3 font-bold lg:text-h2">From raw signal to traceable public insight.</h2>
          </div>
        </Reveal>
        <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <RevealItem key={f.title} className="space-y-3 rounded-card border border-border bg-surface/60 p-5 transition hover:-translate-y-0.5 hover:border-electric/60">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${f.color}1f`, color: f.color }}><Icon className="h-5 w-5" /></span>
                <h3 className="text-h6 font-semibold">{f.title}</h3>
                <p className="text-body-sm text-text-secondary">{f.description}</p>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </section>

      {/* LIVE SIGNALS + WHY */}
      <section className="mx-auto max-w-section px-6 py-8 lg:py-12">
        <div className="grid items-stretch gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal className="h-full"><LiveSignalsFeed items={feed} /></Reveal>
          <Reveal delay={0.1} className="h-full">
            <div className="flex h-full flex-col gap-5 rounded-card border border-border bg-surface/40 p-5 sm:p-6">
              <div className="space-y-3">
                <SectionEyebrow>Why It Matters</SectionEyebrow>
                <h2 className="text-h3 font-bold">Ideas shape reality. <span className="text-gradient">Signals reveal the truth.</span></h2>
              </div>
              <ul className="space-y-3">
                {WHY.map((p) => (
                  <li key={p} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verified" />
                    <span className="text-body-sm text-text-secondary">{p}</span>
                  </li>
                ))}
              </ul>
              {/* proof points — 1 col below 390px, 3 cols at ≥390px */}
              <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-3">
                {PROOF.map((p) => (
                  <div key={p.label} className="flex items-baseline justify-between gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 min-[390px]:flex-col min-[390px]:items-center min-[390px]:gap-0.5 min-[390px]:px-2.5 min-[390px]:text-center">
                    <div className="text-h6 font-bold tabular-nums" style={{ color: p.color }}>{p.value}</div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{p.label}</div>
                  </div>
                ))}
              </div>
              {/* traceability evidence chain — fills the column intentionally */}
              <EvidenceChain />
              <a href="/mission" className="mt-auto block"><Button variant="secondary" className="w-full sm:w-auto">Read our mission <ArrowRight className="h-4 w-4" /></Button></a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MISSION CONTROL PREVIEW */}
      <section className="mx-auto max-w-section px-6 py-12 lg:py-16">
        <Reveal>
          <div className="mb-6 max-w-2xl space-y-3">
            <SectionEyebrow>Mission Control</SectionEyebrow>
            <h2 className="text-h3 font-bold lg:text-h2">An operational view of the signal landscape.</h2>
          </div>
        </Reveal>
        <MissionControlPreview data={MISSION} />
      </section>

      {/* TRACEABILITY PIPELINE */}
      <section className="mx-auto max-w-section px-6 py-12 lg:py-16">
        <Reveal>
          <div className="mb-6 max-w-2xl space-y-3">
            <SectionEyebrow>Traceability</SectionEyebrow>
            <h2 className="text-h3 font-bold lg:text-h2">Every conclusion, traceable end to end.</h2>
          </div>
        </Reveal>
        <TraceabilityPipeline />
      </section>

      {/* HUMAN IN THE LOOP */}
      <section className="mx-auto max-w-section px-6 py-12 lg:py-16">
        <HumanInLoop />
      </section>

      {/* TRUSTED BY */}
      <section className="mx-auto max-w-section px-6 py-10">
        <Reveal>
          <p className="mb-5 text-center text-label uppercase tracking-wide text-text-muted">Built for the people who hold narratives to account</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {TRUSTED.map((t) => {
              const Icon = t.icon;
              return (
                <span key={t.label} className="flex items-center gap-2 text-text-secondary">
                  <Icon className="h-5 w-5 text-text-muted" />
                  <span className="text-body-sm font-medium">{t.label}</span>
                </span>
              );
            })}
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-section px-6 py-12 lg:py-16">
        <Reveal>
          <Card className="relative overflow-hidden p-10 text-center lg:p-14">
            <div className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-40" />
            <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-64 w-[600px] -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.5), transparent 70%)' }} />
            <h2 className="mx-auto max-w-2xl text-h3 font-bold lg:text-h2">See the signals before they shape the story.</h2>
            <p className="mx-auto mt-4 max-w-xl text-body text-text-secondary">Explore the live command center, browse the public signal library, or submit a signal for review.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <a href={appHref('/dashboard')}><Button variant="primary" size="lg">Explore Dashboard <ArrowRight className="h-4 w-4" /></Button></a>
              <a href="/submit-a-signal"><Button variant="secondary" size="lg">Submit a Signal</Button></a>
            </div>
          </Card>
        </Reveal>
      </section>

      {/* CURRENT PLATFORM ACTIVITY (above footer) */}
      <section className="mx-auto max-w-section px-6 pb-16">
        <PlatformActivity metrics={ACTIVITY} />
      </section>
    </main>
  );
}
