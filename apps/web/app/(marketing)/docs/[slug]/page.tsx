// =============================================================================
// HSI Phase 73.4 — Documentation section (/docs/[slug]). Public, data-driven from
// the docs content registry (concepts/workflow/methodology/api/developers/roles/
// faq/changelog). Per-page SEO via generateMetadata. Unknown slug → 404.
// =============================================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader, Section } from '../../../../components/page-header';
import { DOC_PAGES, getDocPage } from '@/lib/docs/content';
import { DocArticle } from '@/components/docs/DocArticle';
import { DocsSidebar } from '@/components/docs/DocsSidebar';

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const page = getDocPage(params.slug);
  if (!page) return { title: 'Documentation' };
  return {
    title: `${page.title} — Documentation`,
    description: page.description,
    keywords: page.keywords,
    alternates: { canonical: `/docs/${page.slug}` },
    openGraph: { title: `${page.title} — HSI Documentation`, description: page.description, url: `/docs/${page.slug}`, type: 'article' },
  };
}

export default function DocSectionPage({ params }: { params: { slug: string } }) {
  const page = getDocPage(params.slug);
  if (!page) notFound();

  return (
    <main className="text-text-primary">
      <PageHeader eyebrow="Documentation" title={page.title} description={page.description} />
      <Section>
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <DocsSidebar activeSlug={page.slug} />
          <DocArticle page={page} />
        </div>
      </Section>
    </main>
  );
}
