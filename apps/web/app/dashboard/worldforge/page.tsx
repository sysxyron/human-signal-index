import Link from 'next/link';
import {
  TopNav,
  Card,
  MetricCard,
  SectionEyebrow,
} from '@hsi/ui';
import {
  Orbit,
  SlidersHorizontal,
  CalendarClock,
  Workflow,
  GitCompareArrows,
  Route,
  FlaskConical,
  ArrowRight,
  Gauge,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Brain,
} from 'lucide-react';
import { getEvaluation, getChronidDemo } from '@/lib/worldforge/worlds';
import { ScientificConfidenceLegend } from '@/components/worldforge/ScientificConfidenceChip';
import { listWorlds, listSimulations } from '@/lib/worldforge/persistence';
import { OfflineNotice } from '@/components/worldforge/PersistenceUI';

// Fetches from Supabase in a Server Component — opt out of static prerender so
// `next build` does not run queries (and so empty sandbox env degrades cleanly).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PIPELINE = [
  'Input',
  'World State',
  'Simulation Graph',
  'Dynamic Recalculation',
  'Report',
];

const SUBPAGES = [
  {
    href: '/dashboard/worldforge/research',
    title: 'Research',
    desc: 'Phase 3 — multi-agent scientific research turns a concept into a debate-tested, fully-traceable world blueprint.',
    icon: FlaskConical,
    accent: '#10B981',
  },
  {
    href: '/dashboard/worldforge/simulations',
    title: 'Simulations',
    desc: 'Per-world reports with full provenance, versioning, and a world-vs-world diff viewer.',
    icon: Orbit,
    accent: '#3B82F6',
  },
  {
    href: '/dashboard/worldforge/scenarios',
    title: 'Scenario Sandbox',
    desc: 'Live sliders that recompute the whole graph instantly. Tune gravity, orbit, cognition…',
    icon: SlidersHorizontal,
    accent: '#8B5CF6',
  },
  {
    href: '/dashboard/worldforge/timelines',
    title: 'Timelines',
    desc: 'Log-scaled evolution, civilization, planetary & stellar timelines across deep time.',
    icon: CalendarClock,
    accent: '#10B981',
  },
  {
    href: '/dashboard/worldforge/dependency-graph',
    title: 'Dependency Graph',
    desc: 'Interactive causal graph. Click any node to trace its inputs, outputs and provenance.',
    icon: Workflow,
    accent: '#06B6D4',
  },
  {
    href: '/dashboard/worldforge/counterfactuals',
    title: 'Counterfactuals',
    desc: 'What-if cascades: change one thing, watch the impact ripple across the world.',
    icon: GitCompareArrows,
    accent: '#F59E0B',
  },
  {
    href: '/dashboard/worldforge/provenance',
    title: 'Provenance',
    desc: 'The WHY-chain for any value, mirroring the HSI traceability engine.',
    icon: Route,
    accent: '#3B82F6',
  },
  {
    href: '/dashboard/worldforge/evidence-intelligence',
    title: 'Evidence Intelligence',
    desc: 'Phase 5 — cross-run evidence health: coverage, support vs contradiction, provider health, and trends.',
    icon: ShieldCheck,
    accent: '#10B981',
  },
  {
    href: '/dashboard/worldforge/universes',
    title: 'Universe Forge',
    desc: 'Run the same world under different physical constants and compare outcomes.',
    icon: FlaskConical,
    accent: '#8B5CF6',
  },
];

export default async function WorldForgeOverviewPage() {
  const earth = getEvaluation('earth');
  const demo = getChronidDemo();
  const chronid = demo.evaluation;

  // LIVE counts from Supabase (graceful fallback to engine/demo data if offline).
  const [worldsRes, simsRes] = await Promise.all([
    listWorlds(),
    listSimulations(),
  ]);
  const live = worldsRes.ok && simsRes.ok;
  const worldCount = worldsRes.ok ? worldsRes.data.length : null;
  const simCount = simsRes.ok ? simsRes.data.length : null;
  const publicCount = worldsRes.ok
    ? worldsRes.data.filter((w) => w.is_public).length
    : null;

  return (
    <>
      <TopNav
        title="WorldForge"
        subtitle="Causal world-simulation subsystem"
      />
      <main className="space-y-8 p-5 lg:p-6">
        {/* Hero */}
        <Card className="relative overflow-hidden" padded>
          <div className="grid-bg absolute inset-0 opacity-40" />
          <div className="relative space-y-4">
            <SectionEyebrow>WorldForge · Phase 2</SectionEyebrow>
            <h2 className="max-w-3xl text-h3 font-semibold text-text-primary">
              Build a world from first principles, then watch every consequence{' '}
              <span className="text-gradient">recompute itself</span>.
            </h2>
            <p className="max-w-2xl text-body-sm leading-relaxed text-text-secondary">
              WorldForge models worlds as a single source of truth. Reports are never
              hand-authored — they are <em>derived</em> from state through a causal
              simulation graph, each value carrying its own provenance and scientific
              confidence.
            </p>

            {/* Pipeline */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {PIPELINE.map((step, i) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-surface-2/70 px-3 py-1.5 text-caption font-semibold text-text-primary">
                    {step}
                  </span>
                  {i < PIPELINE.length - 1 ? (
                    <ArrowRight className="h-4 w-4 text-text-muted" />
                  ) : null}
                </span>
              ))}
            </div>

            <ScientificConfidenceLegend className="pt-2" />
          </div>
        </Card>

        {/* Live persistence KPIs */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h5 font-semibold text-text-primary">
              Persistence at a glance
            </h3>
            {!live ? <OfflineNotice /> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Saved worlds"
              value={worldCount !== null ? String(worldCount) : '—'}
              accent="#3B82F6"
              icon={Orbit}
            />
            <MetricCard
              label="Saved simulations"
              value={simCount !== null ? String(simCount) : '—'}
              accent="#06B6D4"
              icon={Workflow}
            />
            <MetricCard
              label="Public worlds"
              value={publicCount !== null ? String(publicCount) : '—'}
              accent="#10B981"
              icon={Sparkles}
            />
            <MetricCard
              label="Earth · Overall (engine)"
              value={`${earth.overallScore}/100`}
              accent="#8B5CF6"
              icon={Gauge}
            />
          </div>
        </section>

        {/* KPI cards (engine-computed reference worlds) */}
        <section className="space-y-3">
          <h3 className="text-h5 font-semibold text-text-primary">Reference worlds at a glance</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Earth · Overall"
              value={`${earth.overallScore}/100`}
              accent="#10B981"
              icon={Gauge}
            />
            <MetricCard
              label="Earth · Habitability"
              value={`${Math.round(earth.habitability.value * 100)}%`}
              accent="#3B82F6"
              icon={Sparkles}
            />
            <MetricCard
              label="Chronid · Overall"
              value={`${chronid.overallScore}/100`}
              accent="#8B5CF6"
              icon={Brain}
            />
            <MetricCard
              label="Chronid · Top Risk"
              value={`${Math.round((chronid.topRisks[0]?.severity ?? 0) * 100)}%`}
              accent="#EF4444"
              icon={ShieldAlert}
            />
          </div>
        </section>

        {/* Chronid showcase */}
        <section className="space-y-3">
          <h3 className="text-h5 font-semibold text-text-primary">
            Flagship demo · Chronid Prime
          </h3>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="space-y-4" padded>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-caption font-semibold text-accent">
                  Subjective day ≈ 1000 Earth years
                </span>
                <span className="rounded-full bg-electric/15 px-2.5 py-1 text-caption font-semibold text-electric">
                  Frozen super-earth
                </span>
                <span className="rounded-full bg-verified/15 px-2.5 py-1 text-caption font-semibold text-verified">
                  Crystal genetics
                </span>
                <span className="rounded-full bg-warning/15 px-2.5 py-1 text-caption font-semibold text-warning">
                  Geological neural networks
                </span>
                <span className="rounded-full bg-accent/15 px-2.5 py-1 text-caption font-semibold text-accent">
                  Billion-year civilization
                </span>
              </div>
              <p className="text-body-sm leading-relaxed text-text-secondary">
                {chronid.summary}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat
                  label="Temporal niche (geological)"
                  value={`${demo.temporalAdaptation.score}/100 · ${demo.temporalAdaptation.label}`}
                />
                <Stat
                  label="Cognition vs fast regime"
                  value={`${demo.temporalAcrossEnvironments.fast.score}/100 · ${demo.temporalAcrossEnvironments.fast.label}`}
                />
              </div>
              <p className="text-caption leading-relaxed text-text-muted">
                {demo.temporalAdaptation.explanation}
              </p>
              <Link
                href={'/dashboard/worldforge/simulations' as never}
                className="inline-flex items-center gap-1 text-caption font-semibold text-electric hover:text-white"
              >
                Open full Chronid report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Card>

            <Card className="space-y-3" padded>
              <h4 className="text-h6 font-semibold text-text-primary">Top risks</h4>
              <div className="space-y-2">
                {chronid.topRisks.map((r) => (
                  <div
                    key={r.name}
                    className="rounded-lg border border-border bg-surface-2/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-body-sm font-medium text-text-primary">{r.name}</span>
                      <span className="text-caption font-semibold text-warning">
                        {Math.round(r.severity * 100)}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-caption text-text-muted">{r.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* Sub-page links */}
        <section className="space-y-3">
          <h3 className="text-h5 font-semibold text-text-primary">Explore the subsystem</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SUBPAGES.map((p) => {
              const Icon = p.icon;
              return (
                <Link key={p.href} href={p.href as never}>
                  <Card className="group h-full space-y-3" interactive padded>
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${p.accent}1f`, color: p.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h4 className="text-h6 font-semibold text-text-primary">{p.title}</h4>
                    <p className="text-caption leading-relaxed text-text-secondary">{p.desc}</p>
                    <span className="inline-flex items-center gap-1 text-caption font-semibold text-electric">
                      Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <p className="text-label text-text-muted">{label}</p>
      <p className="mt-1 text-body-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
