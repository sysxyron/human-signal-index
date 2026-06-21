// =============================================================================
// HSI Phase 73.4 — Documentation portal index (/docs). Public. Search + section
// directory + resource downloads (Coming Soon). Reuses the marketing design.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '../../../components/page-header';
import { Card, SectionEyebrow } from '@hsi/ui';
import { ArrowUpRight, FileDown, Clock } from 'lucide-react';
import { DOC_INDEX, RESOURCES } from '@/lib/docs/content';
import { buildSearchIndex } from '@/lib/docs/search';
import { DocSearch } from '@/components/docs/DocSearch';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Human Signal Index documentation: core concepts, workflow, methodology, roles, developer overview, API, FAQ, and changelog.',
  keywords: ['HSI documentation', 'OSINT documentation', 'intelligence platform docs', 'methodology', 'API', 'developers'],
  alternates: { canonical: '/docs' },
  openGraph: { title: 'Human Signal Index Documentation', description: 'Concepts, workflow, methodology, roles, developers, API, and FAQ.', url: '/docs', type: 'website' },
};

export default function DocsIndexPage() {
  const index = buildSearchIndex();
  return (
    <main className="text-text-primary">
      <PageHeader eyebrow="Documentation" title="Human Signal Index documentation" description="Reference material for researchers, analysts, reviewers, administrators, and developers. Plain language, evidence-first." />

      <Section>
        <Card className="space-y-3"><DocSearch index={index} /></Card>
      </Section>

      <Section className="pt-0">
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Sections</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Browse the documentation.</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOC_INDEX.map((d) => (
            <a key={d.slug} href={`/docs/${d.slug}`} className="group rounded-card border border-border bg-surface/60 p-5 transition hover:-translate-y-0.5 hover:border-electric/60">
              <div className="flex items-center justify-between"><h3 className="text-h6 font-semibold text-text-primary">{d.title}</h3><ArrowUpRight className="h-4 w-4 text-text-muted transition group-hover:text-electric" /></div>
              <p className="mt-2 text-body-sm text-text-secondary">{d.description}</p>
            </a>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <div className="mb-6 max-w-2xl space-y-2"><SectionEyebrow>Resources</SectionEyebrow><h2 className="text-h3 font-bold lg:text-h2">Downloadable guides.</h2><p className="text-body-lg text-text-secondary">Printable guides are in preparation. They will appear here when ready.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((r) => (
            <Card key={r.title} className="space-y-2">
              <div className="flex items-center gap-2"><FileDown className="h-4 w-4 text-text-muted" /><h3 className="text-body-sm font-semibold text-text-primary">{r.title}</h3></div>
              <p className="text-caption text-text-secondary">{r.detail}</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"><Clock className="h-3 w-3" /> Coming Soon</span>
            </Card>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <Card className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1"><h3 className="text-h6 font-semibold">New to HSI?</h3><p className="text-body-sm text-text-secondary">Start with a simple overview, then work through the Education Hub.</p></div>
          <div className="flex flex-wrap gap-3">
            <a href="/how-hsi-works" className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-electric hover:underline">How HSI Works</a>
            <a href="/education-hub" className="rounded-card border border-border bg-surface-2/40 px-3 py-1.5 text-caption text-text-secondary hover:text-electric">Education Hub</a>
          </div>
        </Card>
      </Section>
    </main>
  );
}
