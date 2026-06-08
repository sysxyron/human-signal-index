// =============================================================================
// WorldForge Phase 5 — EVIDENCE INTELLIGENCE dashboard (Server Component).
// Cross-run evidence health: a coverage ring, support / contradiction /
// unsupported stat cards, totals, a provider-health grid, a coverage timeline,
// and an evidence-outcome heatmap. Reads the aggregate from the evidence DAL.
// force-dynamic + revalidate=0 so it never runs at build time and degrades
// cleanly when Supabase is not configured.
// =============================================================================

import { TopNav, Card } from '@hsi/ui';
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers,
  BarChart3,
} from 'lucide-react';
import { getEvidenceIntelligence } from '@/lib/worldforge/evidence-persistence';
import { coverageScoreColor } from '@/lib/worldforge/evidence-view';
import {
  asScore,
  fmtRatio,
  supportRatioColor,
  riskRatioColor,
} from '@/lib/worldforge/evidence-intel-view';
import { EvidenceIntelStat } from '@/components/worldforge/evidence/EvidenceIntelStat';
import { ProviderHealthGrid } from '@/components/worldforge/evidence/ProviderHealthGrid';
import { CoverageTimelineChart } from '@/components/worldforge/evidence/CoverageTimelineChart';
import { EvidenceHeatmap } from '@/components/worldforge/evidence/EvidenceHeatmap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EvidenceIntelligencePage() {
  const res = await getEvidenceIntelligence();

  if (!res.ok) {
    return (
      <>
        <TopNav title="Evidence Intelligence" subtitle="Cross-run evidence health" />
        <main className="space-y-6 p-5 lg:p-6">
          <Card className="space-y-1.5 border-risk/40 bg-risk/5" padded>
            <h3 className="flex items-center gap-2 text-h5 font-semibold text-risk">
              <BarChart3 className="h-5 w-5" /> Could not load evidence intelligence
            </h3>
            <p className="text-body-sm leading-relaxed text-text-secondary">
              {res.error}
            </p>
            {res.code === 'NOT_CONFIGURED' ? (
              <p className="text-caption text-text-muted">
                Supabase is not configured here. Open a research run&apos;s labeled
                Chronid demo to explore evidence on fixtures, or configure Supabase
                to aggregate evidence across runs.
              </p>
            ) : null}
          </Card>
        </main>
      </>
    );
  }

  const intel = res.data;
  const coverage = asScore(intel.avgCoverageScore);
  const ringColor = coverageScoreColor(coverage);
  const empty = intel.totalRuns === 0;

  return (
    <>
      <TopNav title="Evidence Intelligence" subtitle="Cross-run evidence health" />
      <main className="space-y-6 p-5 lg:p-6">
        {empty ? (
          <Card className="space-y-1.5 border-warning/40 bg-warning/5" padded>
            <h3 className="flex items-center gap-2 text-h6 font-semibold text-warning">
              <Activity className="h-4 w-4" /> No evidence gathered yet
            </h3>
            <p className="text-caption leading-relaxed text-text-secondary">
              Once you gather evidence for a research run, coverage, support and
              contradiction rates, provider health, and trends appear here.
            </p>
          </Card>
        ) : null}

        {/* Top row: coverage ring + ratio stats */}
        <section className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Card className="flex items-center gap-4" padded>
            <CoverageRing score={coverage} color={ringColor} />
            <div className="space-y-1">
              <h2 className="text-h6 font-semibold text-text-primary">
                Avg. coverage
              </h2>
              <p className="max-w-[12rem] text-caption leading-relaxed text-text-muted">
                Average claim coverage across {intel.totalRuns} run
                {intel.totalRuns === 1 ? '' : 's'} with evidence.
              </p>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <EvidenceIntelStat
              label="Support ratio"
              value={fmtRatio(intel.avgSupportRatio)}
              sub={`${intel.totalSupported} supported claims`}
              color={supportRatioColor(intel.avgSupportRatio)}
              icon={CheckCircle2}
            />
            <EvidenceIntelStat
              label="Contradiction ratio"
              value={fmtRatio(intel.avgContradictionRatio)}
              sub={`${intel.totalContradicted} contradicted claims`}
              color={riskRatioColor(intel.avgContradictionRatio, 'contradiction')}
              icon={XCircle}
            />
            <EvidenceIntelStat
              label="Unsupported ratio"
              value={fmtRatio(intel.avgUnsupportedRatio)}
              sub={`${intel.totalUnsupported} unsupported claims`}
              color={riskRatioColor(intel.avgUnsupportedRatio, 'unsupported')}
              icon={HelpCircle}
            />
          </div>
        </section>

        {/* Totals */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <EvidenceIntelStat
            label="Total runs"
            value={String(intel.totalRuns)}
            color="#8B5CF6"
            icon={Activity}
          />
          <EvidenceIntelStat
            label="Supported"
            value={String(intel.totalSupported)}
            color="#10B981"
            icon={CheckCircle2}
          />
          <EvidenceIntelStat
            label="Contradicted"
            value={String(intel.totalContradicted)}
            color="#EF4444"
            icon={XCircle}
          />
          <EvidenceIntelStat
            label="Background / Unsupported"
            value={`${intel.totalBackground} / ${intel.totalUnsupported}`}
            color="#3B82F6"
            icon={Layers}
          />
        </section>

        {/* Provider health */}
        <ProviderHealthGrid providers={intel.providerHealth} />

        {/* Timeline + heatmap */}
        <section className="grid gap-4 xl:grid-cols-2">
          <CoverageTimelineChart points={intel.coverageTimeline} />
          <EvidenceHeatmap intel={intel} />
        </section>
      </main>
    </>
  );
}

/** Coverage ring (0..100). */
function CoverageRing({ score, color }: { score: number; color: string }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-h5 font-bold" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] font-medium text-text-muted">/ 100</span>
      </div>
    </div>
  );
}
