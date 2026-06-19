// =============================================================================
// HSI Phase 68 — Transparency Portal 2.0 overview (/transparency). PUBLIC,
// read-only. Live aggregate metrics from the cached transparency services —
// everything computed from real data, public-safe (no PII / internal / unpublished
// data). The former static commitments now live at /transparency/methodology.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { getTransparencyOverview, getSourceTransparency } from '@/lib/transparency/data';
import { TransparencyNav, MetricTiles, BarList } from '@/components/transparency/panels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Transparency Portal',
  description: 'Where information came from, how evidence was evaluated, which narratives emerged, which forecasts were correct, and how sources earn trust — all computed from real data.',
  alternates: { canonical: '/transparency' },
};

export default async function TransparencyPage() {
  const [overview, sources] = await Promise.all([getTransparencyOverview(), getSourceTransparency()]);

  return (
    <>
      <PageHeader
        eyebrow="Transparency"
        title="If you cannot audit it, you should not trust it."
        description="A live, read-only view of the Human Signal Index intelligence pipeline: signals, evidence, narratives, forecasts, source reliability, and corrections — every number computed from real data, with no hidden calculations."
      />
      <Section>
        <TransparencyNav active="/transparency" />
      </Section>

      <Section className="pt-0 space-y-6">
        <MetricTiles items={[
          { label: 'Signals', value: overview.totalSignals },
          { label: 'Evidence', value: overview.totalEvidence },
          { label: 'Narratives', value: overview.totalNarratives },
          { label: 'Forecasts', value: overview.totalForecasts },
          { label: 'Forecast outcomes', value: overview.totalForecastOutcomes },
          { label: 'Source coverage', value: `${overview.sourceCoverage} types` },
          { label: 'Published reports', value: overview.publicationVolume },
          { label: 'Corrections', value: overview.correctionVolume },
        ]} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">Source network health</h2>
            <p className="text-caption text-text-muted">{overview.activeSources} of {overview.totalSources} sources active · {overview.sourceHealthPct}% healthy · {sources.collectionSuccessPct}% collection success.</p>
            <BarList rows={sources.reliabilityDistribution.map((d) => ({ label: d.tier, value: d.count }))} color="#10B981" />
          </Card>
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">What you can inspect</h2>
            <ul className="space-y-1.5 text-body-sm text-text-secondary">
              <li>• <a href="/transparency/forecasts" className="text-electric hover:underline">Forecast accountability</a> — which forecasts were right, which failed, and how calibrated we are.</li>
              <li>• <a href="/transparency/narratives" className="text-electric hover:underline">Narrative evolution</a> — emerging, dominant, fragmenting storylines + their evidence.</li>
              <li>• <a href="/transparency/sources" className="text-electric hover:underline">Source trust</a> — health, collection success, and reliability trends.</li>
              <li>• <a href="/transparency/corrections" className="text-electric hover:underline">Correction ledger</a> — every retraction and revision, with reasons.</li>
              <li>• <a href="/transparency/methodology" className="text-electric hover:underline">Methodology</a> — exactly how each score is calculated, and its limits.</li>
            </ul>
          </Card>
        </div>
      </Section>
    </>
  );
}
