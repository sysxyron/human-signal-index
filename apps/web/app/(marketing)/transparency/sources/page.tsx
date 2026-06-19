// =============================================================================
// HSI Phase 68 — Source trust (/transparency/sources). PUBLIC, read-only. Source
// health, collection success, failure history, and reliability distribution.
// Reuses Phase 61 + 63 — no crawler / scheduling / scraping changes. Public-safe
// (source names + reliability metrics only).
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { getSourceTransparency } from '@/lib/transparency/data';
import { TransparencyNav, MetricTiles, BarList } from '@/components/transparency/panels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Source Trust',
  description: 'How reliable our sources are: health, collection success, failure history, and reliability trends — observed, never bypassed.',
  alternates: { canonical: '/transparency/sources' },
};

const TIER_TONE: Record<string, string> = { Excellent: 'text-verified', Healthy: 'text-electric', 'At Risk': 'text-warning', Failing: 'text-risk' };
function scoreTone(score: number): string { return score >= 95 ? TIER_TONE.Excellent : score >= 80 ? TIER_TONE.Healthy : score >= 60 ? TIER_TONE['At Risk'] : TIER_TONE.Failing; }

export default async function SourceTransparencyPage() {
  const d = await getSourceTransparency();
  return (
    <>
      <PageHeader eyebrow="Transparency" title="Source trust" description="HSI observes and reports on its sources — it never circumvents protections. Here is each source's measured reliability: health, collection success, and failure history." />
      <Section><TransparencyNav active="/transparency/sources" /></Section>
      <Section className="pt-0 space-y-6">
        <MetricTiles items={[
          { label: 'Total sources', value: d.total }, { label: 'Active', value: d.active },
          { label: 'Healthy', value: d.healthy }, { label: 'Collection success', value: `${d.collectionSuccessPct}%` },
          { label: 'Failed', value: d.failed }, { label: 'Blocked', value: d.blocked },
          { label: 'Stale', value: d.stale }, { label: 'Warning', value: d.warning },
        ]} />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">Reliability distribution</h2>
            <BarList rows={d.reliabilityDistribution.map((r) => ({ label: r.tier, value: r.count }))} color="#10B981" />
          </Card>
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">Most reliable</h2>
            {d.mostReliable.length === 0 ? <p className="text-caption text-text-muted">Not enough data yet.</p> : <ol className="space-y-1.5">{d.mostReliable.map((s, i) => <li key={s.name} className="flex items-center gap-2 text-body-sm"><span className="w-4 text-caption text-text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate text-text-secondary">{s.name}</span><span className="text-caption font-semibold text-verified">{s.score}</span></li>)}</ol>}
          </Card>
          <Card className="space-y-3">
            <h2 className="text-h6 font-semibold text-text-primary">Most fragile</h2>
            {d.mostFragile.length === 0 ? <p className="text-caption text-text-muted">Not enough data yet.</p> : <ol className="space-y-1.5">{d.mostFragile.map((s, i) => <li key={s.name} className="flex items-center gap-2 text-body-sm"><span className="w-4 text-caption text-text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate text-text-secondary">{s.name}</span><span className="text-caption font-semibold text-risk">{s.score}</span></li>)}</ol>}
          </Card>
        </div>

        <Card className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">Sources by reliability</h2>
          {d.sources.length === 0 ? <p className="text-caption text-text-muted">No sources to report yet.</p> : (
            <ul className="space-y-1.5">
              {d.sources.map((s) => (
                <li key={s.name} className="flex items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
                  <span className="min-w-0 flex-1 truncate text-text-secondary">{s.name}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{s.type}</span>
                  <span className="shrink-0 text-caption text-text-muted">{s.successPct}% ok · last {s.lastSuccessLabel}</span>
                  <span className={`shrink-0 text-caption font-semibold tabular-nums ${scoreTone(s.score)}`}>{s.score}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}
