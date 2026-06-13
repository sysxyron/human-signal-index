import {
  Button,
  Card,
  GlobeHero,
  MetricCard,
  SectionEyebrow,
  LineChart,
  DonutChart,
  HeatmapCard,
  DashboardPreviewCard,
} from '@hsi/ui';
import {
  Radio,
  Link2,
  ScanText,
  Gauge,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  Newspaper,
  Microscope,
  Users,
  Landmark,
} from 'lucide-react';

const heroMetrics = [
  { label: 'Active Sources', value: '24,781', accent: '#3B82F6', spark: [12, 18, 15, 22, 28, 26, 34] },
  { label: 'Signals Analyzed', value: '152,390', accent: '#8B5CF6', spark: [40, 38, 52, 60, 58, 72, 88] },
  { label: 'Pending Reviews', value: '8,432', accent: '#F59E0B', spark: [30, 28, 35, 32, 40, 38, 44] },
  { label: 'High-Risk Signals', value: '312', accent: '#EF4444', spark: [8, 10, 9, 14, 12, 18, 22] },
  { label: 'Traceability Score', value: '96.3%', accent: '#10B981', spark: [90, 91, 93, 92, 95, 95, 96] },
];

const features = [
  {
    icon: Radio,
    title: 'Collect Public Signals',
    description:
      'Continuously capture public narratives, campaigns, and open-source evidence across platforms.',
    color: '#3B82F6',
  },
  {
    icon: Link2,
    title: 'Trace Everything',
    description:
      'Link every finding back to the original passages and timestamps, with a record you can verify.',
    color: '#10B981',
  },
  {
    icon: ScanText,
    title: 'Analyze Rhetoric',
    description:
      'Classify narratives with a structured taxonomy of rhetoric, framing, and influence.',
    color: '#8B5CF6',
  },
  {
    icon: Gauge,
    title: 'Score & Prioritize Risk',
    description:
      'Assign clear risk levels that reviewers can act on, each with a plain explanation.',
    color: '#F59E0B',
  },
  {
    icon: GraduationCap,
    title: 'Educate & Empower',
    description:
      'Produce reports, explainers, and counter-narratives the public can read and check.',
    color: '#EF4444',
  },
];

const whyPoints = [
  'Narratives move faster than facts — we restore the evidence trail.',
  'Every claim is traceable back to a verifiable source passage.',
  'Human reviewers stay in the loop on every published conclusion.',
  'Risk scoring is explainable, not a black box.',
];

const trustedBy = [
  { icon: Microscope, label: 'Researchers' },
  { icon: Newspaper, label: 'Journalists' },
  { icon: GraduationCap, label: 'Educators' },
  { icon: Users, label: 'Concerned Citizens' },
  { icon: Landmark, label: 'Policy Analysts' },
];

const trendSeries = [
  { name: 'Signals', color: '#3B82F6', data: [22, 30, 28, 42, 38, 55, 60, 72] },
  { name: 'High-risk', color: '#EF4444', data: [6, 9, 7, 14, 11, 18, 16, 24] },
];

// deterministic pseudo-random heatmap (avoids hydration mismatch)
const heatRows = Array.from({ length: 5 }, (_, r) =>
  Array.from({ length: 12 }, (_, c) =>
    Math.abs(Math.sin((r + 1) * 1.7 + (c + 1) * 0.9)),
  ),
);

export default function HomePage() {
  return (
    <main className="text-text-primary">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
        <div className="relative mx-auto grid max-w-page items-center gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div className="max-w-xl space-y-6 animate-fade-up">
            <SectionEyebrow>A Public-Interest Observatory</SectionEyebrow>
            <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[44px] lg:text-h1">
              Mapping the Narratives That Shape{' '}
              <span className="text-electric">Humanity.</span>
            </h1>
            <p className="text-body-lg text-text-secondary">
              Human Signal Index tracks, analyzes, and explains the ideas,
              ideologies, movements, and signals influencing human behavior and
              civilization — with traceability, transparency, and context.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="/dashboard">
                <Button variant="primary" size="lg">
                  Explore Live Signals <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
              <a href="/methodology">
                <Button variant="secondary" size="lg">
                  Learn Our Methodology
                </Button>
              </a>
            </div>
            <p className="text-body-sm text-text-muted">
              Evidence first. Traceability always. Humanity above all.
            </p>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <GlobeHero />
          </div>
        </div>

        {/* metric strip */}
        <div className="relative mx-auto max-w-page px-6 pb-16">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {heroMetrics.map((m) => (
              <MetricCard
                key={m.label}
                label={m.label}
                value={m.value}
                accent={m.accent}
                sparkline={m.spark}
                sparklineColor={m.accent}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-section px-6 py-16 lg:py-20">
        <div className="mb-10 max-w-2xl space-y-3">
          <SectionEyebrow>How It Works</SectionEyebrow>
          <h2 className="text-h3 font-bold lg:text-h2">
            From raw signal to traceable public insight.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <Card key={f.title} interactive className="space-y-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${f.color}1f`, color: f.color }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-h6 font-semibold">{f.title}</h3>
                <p className="text-body-sm text-text-secondary">{f.description}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* WHY IT MATTERS + dashboard preview */}
      <section className="mx-auto max-w-section px-6 py-16 lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <SectionEyebrow>Why It Matters</SectionEyebrow>
            <h2 className="text-h3 font-bold lg:text-h2">
              Ideas Shape Reality.{' '}
              <span className="text-gradient">Signals Reveal the Truth.</span>
            </h2>
            <p className="text-body text-text-secondary">
              The narratives that move populations rarely arrive with their
              evidence attached. HSI rebuilds that chain — so the public can see
              not just what is being said, but where it came from and why it
              matters.
            </p>
            <ul className="space-y-3">
              {whyPoints.map((p) => (
                <li key={p} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verified" />
                  <span className="text-body-sm text-text-secondary">{p}</span>
                </li>
              ))}
            </ul>
            <a href="/about">
              <Button variant="secondary">
                Read our mission <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>

          <DashboardPreviewCard>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Signals / 24h" value="1,284" accent="#3B82F6" delta={{ value: '+12.4%', trend: 'up' }} />
                <MetricCard label="Risk Index" value="34.8" accent="#EF4444" delta={{ value: '+3.1%', trend: 'up' }} deltaTone="negative" />
                <MetricCard label="Verified" value="96.3%" accent="#10B981" delta={{ value: '+0.6%', trend: 'up' }} />
              </div>
              <Card className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-h6 font-semibold">Signal volume trend</h4>
                  <span className="text-caption text-text-muted">Last 8 weeks</span>
                </div>
                <LineChart series={trendSeries} height={150} xLabels={['W1', 'W4', 'W8']} />
              </Card>
              <div className="grid grid-cols-2 gap-3">
                <HeatmapCard
                  title="Narrative heatmap"
                  matrix={heatRows}
                  color="#EF4444"
                />
                <Card className="flex items-center justify-center">
                  <DonutChart
                    size={130}
                    thickness={16}
                    centerValue="5"
                    centerLabel="categories"
                    segments={[
                      { label: 'Misinfo', value: 34, color: '#EF4444' },
                      { label: 'Influence', value: 26, color: '#8B5CF6' },
                      { label: 'Recruit', value: 22, color: '#F59E0B' },
                      { label: 'Other', value: 18, color: '#3B82F6' },
                    ]}
                  />
                </Card>
              </div>
            </div>
          </DashboardPreviewCard>
        </div>
      </section>

      {/* TRUSTED BY */}
      <section className="border-y border-border bg-background-deep/60">
        <div className="mx-auto max-w-section px-6 py-12 text-center">
          <p className="text-label text-text-muted">
            Trusted by Researchers, Journalists, Educators &amp; Concerned Citizens
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {trustedBy.map((t) => {
              const Icon = t.icon;
              return (
                <span
                  key={t.label}
                  className="flex items-center gap-2 text-text-secondary"
                >
                  <Icon className="h-5 w-5 text-text-muted" />
                  <span className="text-body-sm font-medium">{t.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-section px-6 py-16 lg:py-20">
        <Card className="relative overflow-hidden p-10 text-center lg:p-14">
          <div className="pointer-events-none absolute inset-0 -z-10 grid-bg opacity-40" />
          <div
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-64 w-[600px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.5), transparent 70%)' }}
          />
          <h2 className="mx-auto max-w-2xl text-h3 font-bold lg:text-h2">
            See the signals before they shape the story.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body text-text-secondary">
            Explore the live command center, browse the public signal library, or
            submit a signal for review.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href="/dashboard">
              <Button variant="primary" size="lg">
                Explore Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
            <a href="/submit-a-signal">
              <Button variant="secondary" size="lg">
                Submit a Signal
              </Button>
            </a>
          </div>
        </Card>
      </section>
    </main>
  );
}
