// =============================================================================
// HSI Phase 69 — Product detail (/marketplace/[slug]). PUBLIC, server-rendered.
// Title, publisher, category, description, version, provenance (computed counts +
// transparency links), analytics, and engagement (download/favorite/rate). Only
// published products; everything traceable back to real intelligence.
// =============================================================================

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader, Section } from '@/components/page-header';
import { Card } from '@hsi/ui';
import { getProductDetail } from '@/lib/marketplace/data';
import { ProductTypeBadge, ProvenancePanel, AnalyticsTiles } from '@/components/marketplace/panels';
import { ProductEngagement, ViewBeacon } from '@/components/marketplace/ProductEngagement';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const detail = await getProductDetail(params.slug);
  if (!detail) return { title: 'Product' };
  return { title: detail.product.title, description: detail.product.summary ?? 'Intelligence product', alternates: { canonical: `/marketplace/${params.slug}` } };
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const detail = await getProductDetail(params.slug);
  if (!detail) notFound();
  const { product, provenance, analytics, transparencyLinks } = detail;

  return (
    <>
      <ViewBeacon productId={product.id} />
      <PageHeader eyebrow="Marketplace" title={product.title} description={product.summary ?? undefined} />
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <ProductTypeBadge type={product.productType} />
          {product.publisherName && product.publisherId ? <a href={`/marketplace/publishers/${product.publisherId}`} className="text-caption text-electric hover:underline">by {product.publisherName}</a> : null}
          <span className="text-caption text-text-muted">v{product.version} · {product.licenseType} license</span>
        </div>

        <ProductEngagement productId={product.id} />
        <AnalyticsTiles analytics={analytics} />

        {product.summary ? (
          <Card className="space-y-2"><h2 className="text-h6 font-semibold text-text-primary">About</h2><p className="text-body-sm text-text-secondary">{product.summary}</p></Card>
        ) : null}

        <ProvenancePanel provenance={provenance} links={transparencyLinks} />

        <Card className="space-y-2">
          <h2 className="text-h6 font-semibold text-text-primary">Why you can trust this</h2>
          <p className="text-body-sm text-text-secondary">This product is assembled from {provenance.sources} sources, {provenance.evidence} evidence items, {provenance.narratives} narratives, and {provenance.forecasts} forecasts already produced and validated by the platform. Follow the transparency links above to inspect source reliability, narrative evolution, forecast outcomes, and the correction ledger.</p>
        </Card>
      </Section>
    </>
  );
}
