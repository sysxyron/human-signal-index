// =============================================================================
// HSI Phase 69 — Intelligence Marketplace: shared types + PURE helpers (no I/O).
//
// Product vocabulary, asset (provenance) vocabulary, and the public-safe payload
// shapes. The marketplace PACKAGES existing intelligence — it never generates it.
// PURE: no clocks, no DB.
// =============================================================================

export const PRODUCT_TYPES = [
  'RESEARCH_REPORT', 'FORECAST_PACKAGE', 'WATCHLIST', 'SOURCE_COLLECTION',
  'NARRATIVE_PACKAGE', 'EVIDENCE_COLLECTION', 'MONITORING_FEED', 'EXECUTIVE_BRIEF',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ASSET_TYPES = [
  'SOURCE', 'SIGNAL', 'EVIDENCE', 'NARRATIVE', 'FORECAST', 'PUBLICATION', 'GRAPH_NODE', 'WATCHLIST', 'CORRECTION',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  RESEARCH_REPORT: 'Research Report', FORECAST_PACKAGE: 'Forecast Package', WATCHLIST: 'Watchlist',
  SOURCE_COLLECTION: 'Source Collection', NARRATIVE_PACKAGE: 'Narrative Package',
  EVIDENCE_COLLECTION: 'Evidence Collection', MONITORING_FEED: 'Monitoring Feed', EXECUTIVE_BRIEF: 'Executive Brief',
};

export function isProductType(v: unknown): v is ProductType {
  return typeof v === 'string' && (PRODUCT_TYPES as readonly string[]).includes(v);
}
export function isProductStatus(v: unknown): v is ProductStatus {
  return typeof v === 'string' && (PRODUCT_STATUSES as readonly string[]).includes(v);
}
export function isAssetType(v: unknown): v is AssetType {
  return typeof v === 'string' && (ASSET_TYPES as readonly string[]).includes(v);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'product';
}

/** Mean rating (1 decimal) from a list of 1–5 ratings; 0 when none. */
export function avgRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;
  return Math.round((ratings.reduce((a, x) => a + x, 0) / ratings.length) * 10) / 10;
}

export interface ProductProvenance { sources: number; evidence: number; narratives: number; forecasts: number; publications: number; corrections: number }

export interface MarketplaceProduct {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  productType: ProductType;
  categorySlug: string | null;
  publisherId: string | null;
  publisherName: string | null;
  status: ProductStatus;
  featured: boolean;
  pinned: boolean;
  version: number;
  sourceCount: number;
  evidenceCount: number;
  narrativeCount: number;
  forecastCount: number;
  licenseType: string;
  priceTier: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface ProductAsset { assetType: AssetType; assetId: string; label: string | null }

export interface ProductAnalytics { downloads: number; favorites: number; views: number; ratingCount: number; avgRating: number }

export interface Publisher {
  id: string;
  name: string;
  slug: string | null;
  bio: string | null;
  verified: boolean;
  createdAt: string;
}

export interface MarketplaceCategory { slug: string; label: string; productType: string; description: string | null; count?: number }

export interface ProductRating { rating: number; review: string | null; createdAt: string }
