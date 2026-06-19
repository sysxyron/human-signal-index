// =============================================================================
// HSI Phase 68 — Forecast accountability (/transparency/forecasts). PUBLIC,
// read-only. Resolved vs failed forecasts, calibration, accuracy trend, and a
// resolution timeline — public-safe (no creator identities / drafts). Reuses
// Phase 67; no fabricated metrics.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { getForecastTransparency } from '@/lib/transparency/data';
import { TransparencyNav, MetricTiles, BarList, fmtDate } from '@/components/transparency/panels';
import type { PublicForecast } from '@/lib/transparency/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Forecast Accountability',
  description: 'Which forecasts were correct, which failed, and how well-calibrated HSI forecasts are — computed from resolved outcomes.',
  alternates: { canonical: '/transparency/forecasts' },
};

function ForecastRow({ f }: { f: PublicForecast }) {
  const tone = f.result === 'correct' ? 'text-verified' : f.result === 'incorrect' ? 'text-risk' : 'text-text-muted';
  return (
    <li className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
      <span className="min-w-0 flex-1 truncate text-text-secondary">{f.title}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{f.predictionType}</span>
      {f.confidence != null ? <span className="shrink-0 text-caption text-text-muted">{Math.round(f.confidence * 100)}%</span> : null}
      <span className="shrink-0 flex gap-1 text-[10px] text-text-muted">{f.hasNarrative ? <span title="links to a narrative">▮N</span> : null}{f.hasGraphNode ? <span title="links to the evidence graph">▮G</span> : null}</span>
      <span className={`shrink-0 text-caption font-semibold ${tone}`}>{f.result ?? f.status}</span>
    </li>
  );
}

export default async function ForecastTransparencyPage() {
  const d = await getForecastTransparency();
  return (
    <>
      <PageHeader eyebrow="Transparency" title="Forecast accountability" description="We record forecasts before outcomes are known, then evaluate them against reality. Here is the honest scorecard — including the ones we got wrong." />
      <Section><TransparencyNav active="/transparency/forecasts" /></Section>
      <Section className="pt-0 space-y-6">
        <MetricTiles items={[
          { label: 'Active', value: d.active }, { label: 'Resolved', value: d.resolved },
          { label: 'Correct', value: d.correct }, { label: 'Incorrect', value: d.incorrect },
          { label: 'Accuracy', value: `${d.accuracy}%` }, { label: 'Calibration', value: `${d.calibrationScore}/100` },
          { label: 'Resolution rate', value: `${d.resolutionRate}%` }, { label: 'Expired', value: d.expired },
        ]} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">Calibration curve</h2>
            <p className="text-caption text-text-muted">Stated confidence vs actual accuracy, per band. Well-calibrated = the two match.</p>
            {d.calibration.length === 0 ? <p className="text-caption text-text-muted">No resolved forecasts yet.</p> : (
              <BarList rows={d.calibration.map((b) => ({ label: `Confidence ${b.bucket}`, value: Math.round(b.actualAccuracy * 100), hint: `predicted ${Math.round(b.predictedConfidence * 100)}% · actual ${Math.round(b.actualAccuracy * 100)}% · n=${b.count}` }))} color="#8B5CF6" />
            )}
          </Card>
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">Accuracy trend</h2>
            {d.accuracyTrend.length === 0 ? <p className="text-caption text-text-muted">Trend appears as forecasts resolve.</p> : (
              <ul className="space-y-1 text-caption text-text-muted">
                {d.accuracyTrend.slice(-10).map((p) => <li key={p.at} className="flex items-center gap-2"><span className="w-28 shrink-0">{fmtDate(p.at)}</span><span>accuracy {p.accuracy}% · calibration {p.calibration} · volume {p.volume}</span></li>)}
              </ul>
            )}
          </Card>
        </div>

        <Card className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">Resolution timeline</h2>
          {d.resolutionTimeline.length === 0 ? <p className="text-caption text-text-muted">No resolved forecasts yet.</p> : <ul className="space-y-1.5">{d.resolutionTimeline.map((f) => <ForecastRow key={f.id} f={f} />)}</ul>}
        </Card>

        <Card className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">Active forecasts</h2>
          {d.activeForecasts.length === 0 ? <p className="text-caption text-text-muted">No active forecasts.</p> : <ul className="space-y-1.5">{d.activeForecasts.map((f) => <ForecastRow key={f.id} f={f} />)}</ul>}
        </Card>
      </Section>
    </>
  );
}
