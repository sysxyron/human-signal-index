// =============================================================================
// HSI Phase 69 — Intelligence Marketplace catalog (/marketplace). PUBLIC, server-
// rendered. Featured / trending / new products, categories, top publishers,
// search + category filters. Published products only; provenance-backed; nothing
// fabricated. The marketplace distributes existing intelligence — it never creates it.
// =============================================================================

import type { Metadata } from 'next';
import { PageHeader, Section } from '@/components/page-header';
import { getMarketplaceCatalog } from '@/lib/marketplace/data';
import { getMarketplaceProducts } from '@/lib/marketplace/service';
import { ProductGrid, CategoryChips, TopPublishers } from '@/components/marketplace/panels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Intelligence Marketplace',
  description: 'Discover and license provenance-backed intelligence products — research reports, forecast packages, watchlists, source and narrative collections — all traceable to real HSI intelligence.',
  alternates: { canonical: '/marketplace' },
};

export default async function MarketplacePage({ searchParams }: { searchParams?: { category?: string; q?: string } }) {
  const category = searchParams?.category;
  const q = searchParams?.q;
  const catalog = await getMarketplaceCatalog();
  const filtered = (category || q) ? await getMarketplaceProducts({ categorySlug: category, search: q, limit: 60 }) : null;

  return (
    <>
      <PageHeader
        eyebrow="Marketplace"
        title="Intelligence you can trace to its source."
        description="Every product packages real HSI intelligence — sources, evidence, narratives, and forecasts — with provenance you can inspect. No synthetic reports, no black boxes."
      />

      <Section className="space-y-4">
        <form action="/marketplace" method="get" className="flex gap-2">
          <input name="q" defaultValue={q ?? ''} placeholder="Search products…" className="min-w-[240px] flex-1 rounded-btn border border-border bg-surface/80 px-4 py-2 text-sm text-text-primary" aria-label="Search marketplace" />
          <button type="submit" className="rounded-btn border border-border bg-surface-2/60 px-4 py-2 text-caption font-semibold text-electric transition hover:border-electric">Search</button>
        </form>
        <CategoryChips categories={catalog.categories} active={category} />
      </Section>

      {filtered ? (
        <Section className="pt-0">
          <h2 className="mb-3 text-h6 font-semibold text-text-primary">{q ? `Results for "${q}"` : catalog.categories.find((c) => c.slug === category)?.label ?? 'Products'}</h2>
          <ProductGrid products={filtered} empty="No matching products." />
        </Section>
      ) : (
        <>
          {catalog.featured.length > 0 ? (
            <Section className="pt-0"><h2 className="mb-3 text-h6 font-semibold text-text-primary">Featured</h2><ProductGrid products={catalog.featured} /></Section>
          ) : null}
          <Section className="pt-0"><h2 className="mb-3 text-h6 font-semibold text-text-primary">Trending</h2><ProductGrid products={catalog.trending} empty="No products yet — the catalog populates as intelligence is published." /></Section>
          <Section className="pt-0">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2"><h2 className="mb-3 text-h6 font-semibold text-text-primary">New</h2><ProductGrid products={catalog.newest} empty="No products yet." /></div>
              <div><TopPublishers rows={catalog.topPublishers} /></div>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
