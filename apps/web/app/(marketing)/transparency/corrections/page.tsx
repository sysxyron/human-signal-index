// =============================================================================
// HSI Phase 68 — Correction ledger (/transparency/corrections). PUBLIC, read-only.
// Every retraction and publication revision, with its reason — the immutable
// public correction log. Only world-readable (PUBLISHED/RETRACTED) publications.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { getCorrectionTransparency } from '@/lib/transparency/data';
import { TransparencyNav, MetricTiles, fmtDate } from '@/components/transparency/panels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Correction Ledger',
  description: 'When we get something wrong, we publish the correction and the reason for it. An immutable log of retractions and revisions.',
  alternates: { canonical: '/transparency/corrections' },
};

export default async function CorrectionTransparencyPage() {
  const d = await getCorrectionTransparency();
  return (
    <>
      <PageHeader eyebrow="Transparency" title="Correction ledger" description="Trust is earned by owning mistakes. Every retraction and revision to a published item is recorded here, immutably, with the reason it changed." />
      <Section><TransparencyNav active="/transparency/corrections" /></Section>
      <Section className="pt-0 space-y-6">
        <MetricTiles items={[{ label: 'Retractions', value: d.retractions }, { label: 'Revisions', value: d.revisions }, { label: 'Total entries', value: d.entries.length }]} />
        <Card className="space-y-3">
          <h2 className="text-h6 font-semibold text-text-primary">History</h2>
          {d.entries.length === 0 ? <p className="text-caption text-text-muted">No corrections on record.</p> : (
            <ul className="space-y-2">
              {d.entries.map((e) => (
                <li key={e.id} className="rounded-card border border-border bg-background-deep/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${e.kind === 'retraction' ? 'border-risk/40 bg-risk/10 text-risk' : 'border-warning/40 bg-warning/10 text-warning'}`}>{e.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">{e.publicationTitle}</span>
                    <span className="shrink-0 text-caption text-text-muted">{fmtDate(e.at)}</span>
                  </div>
                  <p className="mt-1 text-caption text-text-secondary">{e.fromState ? `${e.fromState} → ${e.toState}` : e.toState}{e.reason ? ` — ${e.reason}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </>
  );
}
