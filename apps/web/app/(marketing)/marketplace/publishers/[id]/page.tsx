// =============================================================================
// HSI Phase 69 — Publisher profile (/marketplace/publishers/[id]). PUBLIC, server-
// rendered. Profile + published products + computed transparency metrics (product
// count, downloads, avg rating, forecast accuracy from linked forecasts). No
// fabricated reputation score — accuracy is null when there are no forecasts.
// =============================================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { ShieldCheck } from 'lucide-react';
import { getPublisherProfile } from '@/lib/marketplace/data';
import { ProductGrid } from '@/components/marketplace/panels';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const profile = await getPublisherProfile(params.id);
  return { title: profile ? `${profile.publisher.name} — Publisher` : 'Publisher', alternates: { canonical: `/marketplace/publishers/${params.id}` } };
}

export default async function PublisherPage({ params }: { params: { id: string } }) {
  const profile = await getPublisherProfile(params.id);
  if (!profile) notFound();
  const { publisher, products, productCount, totalDownloads, avgRating, forecastAccuracy } = profile;

  return (
    <>
      <PageHeader eyebrow="Marketplace publisher" title={publisher.name} description={publisher.bio ?? undefined} />
      <Section className="space-y-6">
        {publisher.verified ? <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-verified"><ShieldCheck className="h-4 w-4" /> Verified publisher</p> : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="text-center"><div className="text-h5 font-bold tabular-nums text-text-primary">{productCount}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">Products</div></Card>
          <Card className="text-center"><div className="text-h5 font-bold tabular-nums text-text-primary">{totalDownloads.toLocaleString('en-US')}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">Downloads</div></Card>
          <Card className="text-center"><div className="text-h5 font-bold tabular-nums text-text-primary">{avgRating || '—'}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">Avg rating</div></Card>
          <Card className="text-center"><div className="text-h5 font-bold tabular-nums text-text-primary">{forecastAccuracy == null ? '—' : `${forecastAccuracy}%`}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">Forecast accuracy</div></Card>
        </div>

        <div><h2 className="mb-3 text-h6 font-semibold text-text-primary">Published products</h2><ProductGrid products={products} empty="No published products yet." /></div>
      </Section>
    </>
  );
}
