// =============================================================================
// HSI Phase 69 — Marketplace catalog/detail data (SERVER-ONLY, read). Public-safe
// (published products only). Catalog is cached; product detail is live (analytics
// + view logging). Provenance counts are computed from real asset links — no
// fabricated numbers. Reuses Phase 64/65/67/68 only by LINKING (no duplication).
// =============================================================================

import { unstable_cache } from 'next/cache';
import { readPublicClient } from '@/lib/public-intelligence';
import {
  listProductsDal, listCategoriesDal, listPublishersDal, getProductBySlugDal,
  getPublisherDal, listAssetsDal, getAnalyticsDal, countAssets,
} from './persistence';
import type { MarketplaceProduct, Publisher, MarketplaceCategory, ProductAsset, ProductAnalytics, ProductProvenance } from './types';

export interface MarketplaceCatalog {
  featured: MarketplaceProduct[];
  trending: MarketplaceProduct[];
  newest: MarketplaceProduct[];
  categories: MarketplaceCategory[];
  topPublishers: { publisher: Publisher; productCount: number }[];
  totalProducts: number;
}

async function loadCatalog(): Promise<MarketplaceCatalog> {
  const empty: MarketplaceCatalog = { featured: [], trending: [], newest: [], categories: [], topPublishers: [], totalProducts: 0 };
  const c = readPublicClient();
  if (!c) return empty;

  const [published, categories, publishers] = await Promise.all([
    listProductsDal(c, { status: 'published', limit: 200 }),
    listCategoriesDal(c),
    listPublishersDal(c, 100),
  ]);

  // category counts (computed)
  const catCount = new Map<string, number>();
  for (const p of published) if (p.categorySlug) catCount.set(p.categorySlug, (catCount.get(p.categorySlug) ?? 0) + 1);
  const categoriesWithCounts = categories.map((cat) => ({ ...cat, count: catCount.get(cat.slug) ?? 0 }));

  // top publishers by published-product count (computed)
  const pubCount = new Map<string, number>();
  for (const p of published) if (p.publisherId) pubCount.set(p.publisherId, (pubCount.get(p.publisherId) ?? 0) + 1);
  const topPublishers = publishers
    .map((pub) => ({ publisher: pub, productCount: pubCount.get(pub.id) ?? 0 }))
    .filter((x) => x.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 8);

  // trending by engagement (real counts)
  const score = new Map<string, number>();
  try {
    const { data: dls } = await c.from('marketplace_downloads').select('product_id').limit(20000);
    for (const r of (dls ?? []) as Array<{ product_id: string }>) score.set(r.product_id, (score.get(r.product_id) ?? 0) + 1);
    const { data: favs } = await c.from('marketplace_favorites').select('product_id').limit(20000);
    for (const r of (favs ?? []) as Array<{ product_id: string }>) score.set(r.product_id, (score.get(r.product_id) ?? 0) + 2);
  } catch { /* ignore */ }

  return {
    featured: published.filter((p) => p.featured).slice(0, 8),
    trending: [...published].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)).slice(0, 8),
    newest: published.slice(0, 12),
    categories: categoriesWithCounts,
    topPublishers,
    totalProducts: published.length,
  };
}

export const getMarketplaceCatalog = unstable_cache(loadCatalog, ['marketplace:catalog:v1'], { revalidate: 120, tags: ['marketplace'] });

// ---- product detail (live) -------------------------------------------------

export interface ProductDetail {
  product: MarketplaceProduct;
  assets: ProductAsset[];
  provenance: ProductProvenance;
  analytics: ProductAnalytics;
  transparencyLinks: { label: string; href: string }[];
}

const TRANSPARENCY_LINKS = [
  { label: 'Source reliability', href: '/transparency/sources' },
  { label: 'Narrative evolution', href: '/transparency/narratives' },
  { label: 'Forecast accountability', href: '/transparency/forecasts' },
  { label: 'Correction ledger', href: '/transparency/corrections' },
  { label: 'Methodology', href: '/transparency/methodology' },
];

export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  const c = readPublicClient();
  if (!c) return null;
  const product = await getProductBySlugDal(c, slug);
  if (!product || product.status !== 'published') return null;
  const [assets, analytics] = await Promise.all([listAssetsDal(c, product.id), getAnalyticsDal(c, product.id)]);
  const counts = countAssets(assets);
  const provenance: ProductProvenance = {
    sources: counts.source, evidence: counts.evidence, narratives: counts.narrative,
    forecasts: counts.forecast, publications: counts.publication, corrections: counts.correction,
  };
  return { product, assets, provenance, analytics, transparencyLinks: TRANSPARENCY_LINKS };
}

// ---- publisher profile (computed) ------------------------------------------

export interface PublisherProfile {
  publisher: Publisher;
  products: MarketplaceProduct[];
  productCount: number;
  totalDownloads: number;
  avgRating: number;
  forecastAccuracy: number | null; // null when no forecasts (no fabrication)
}

export async function getPublisherProfile(id: string): Promise<PublisherProfile | null> {
  const c = readPublicClient();
  if (!c) return null;
  const publisher = await getPublisherDal(c, id);
  if (!publisher) return null;
  const products = await listProductsDal(c, { status: 'published', publisherId: id, limit: 100 });

  let totalDownloads = 0; const ratings: number[] = [];
  const forecastAssetIds: string[] = [];
  for (const p of products) {
    const [analytics, assets] = await Promise.all([getAnalyticsDal(c, p.id), listAssetsDal(c, p.id)]);
    totalDownloads += analytics.downloads;
    if (analytics.ratingCount > 0) for (let i = 0; i < analytics.ratingCount; i++) ratings.push(analytics.avgRating);
    for (const a of assets) if (a.assetType === 'FORECAST') forecastAssetIds.push(a.assetId);
  }
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, x) => a + x, 0) / ratings.length) * 10) / 10 : 0;

  // forecast accuracy across the publisher's linked forecasts (computed, or null)
  let forecastAccuracy: number | null = null;
  if (forecastAssetIds.length > 0) {
    try {
      const { data } = await c.from('forecast_scores').select('result').in('forecast_id', Array.from(new Set(forecastAssetIds)).slice(0, 1000));
      const scored = (data ?? []) as Array<{ result: string | null }>;
      const resolved = scored.filter((r) => r.result === 'correct' || r.result === 'incorrect');
      if (resolved.length > 0) forecastAccuracy = Math.round((resolved.filter((r) => r.result === 'correct').length / resolved.length) * 100);
    } catch { /* ignore */ }
  }

  return { publisher, products, productCount: products.length, totalDownloads, avgRating, forecastAccuracy };
}
