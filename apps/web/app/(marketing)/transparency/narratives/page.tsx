// =============================================================================
// HSI Phase 68 — Narrative evolution (/transparency/narratives). PUBLIC, read-only.
// Emerging / growing / dominant / fragmenting / declining narratives + their
// source diversity, evidence density, contradiction ratio, and stability. Reuses
// Phase 65; no new narrative engine, public-safe (names + metrics only).
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { getNarrativeTransparency } from '@/lib/transparency/data';
import { TransparencyNav, MetricTiles } from '@/components/transparency/panels';
import type { PublicNarrative } from '@/lib/transparency/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Narrative Evolution',
  description: 'Observable information structures — emerging, dominant, fragmenting, and declining narratives, with their source diversity, evidence density, and stability.',
  alternates: { canonical: '/transparency/narratives' },
};

const pctOrDash = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`);

function NarrativeGroup({ title, rows, accent }: { title: string; rows: PublicNarrative[]; accent: string }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} /><h2 className="text-h6 font-semibold text-text-primary">{title}</h2><span className="ml-auto text-caption text-text-muted">{rows.length}</span></div>
      {rows.length === 0 ? <p className="text-caption text-text-muted">None.</p> : (
        <ul className="space-y-1.5">
          {rows.map((nNar) => (
            <li key={nNar.id} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
              <p className="truncate text-body-sm font-medium text-text-primary">{nNar.name}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">source diversity {pctOrDash(nNar.sourceDiversity)} · evidence {pctOrDash(nNar.evidenceDensity)} · contradiction {pctOrDash(nNar.contradictionRatio)} · stability {nNar.stabilityScore ?? '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function NarrativeTransparencyPage() {
  const d = await getNarrativeTransparency();
  const s = (k: string) => d.byStatus[k] ?? 0;
  return (
    <>
      <PageHeader eyebrow="Transparency" title="Narrative evolution" description="Narratives are observable information structures, not opinions: recurring clusters of claims, evidence, and sources. We track how they emerge, grow, fragment, and decline — with the evidence behind each." />
      <Section><TransparencyNav active="/transparency/narratives" /></Section>
      <Section className="pt-0 space-y-6">
        <MetricTiles items={[
          { label: 'Emerging', value: s('emerging') }, { label: 'Growing', value: s('active') },
          { label: 'Dominant', value: s('dominant') }, { label: 'Fragmenting', value: s('fragmenting') },
          { label: 'Declining', value: s('declining') },
        ]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <NarrativeGroup title="Emerging" rows={d.emerging} accent="#0EA5E9" />
          <NarrativeGroup title="Growing" rows={d.growing} accent="#10B981" />
          <NarrativeGroup title="Dominant" rows={d.dominant} accent="#F59E0B" />
          <NarrativeGroup title="Fragmenting" rows={d.fragmenting} accent="#EF4444" />
          <NarrativeGroup title="Declining" rows={d.declining} accent="#94A3B8" />
        </div>
      </Section>
    </>
  );
}
