// =============================================================================
// HSI Phase 69 — Marketplace DAL (SERVER-ONLY). Reads/writes the marketplace
// tables via the passed client. Public catalog reads go through the cached service
// (service-role, published-only enforced in code); authed favorite/rate use the
// cookie RLS client; admin writes use the admin client. Never throws; degrades.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type MarketplaceProduct, type Publisher, type ProductAsset, type ProductAnalytics,
  type MarketplaceCategory, type ProductType, type ProductStatus, type AssetType,
  isProductType, isProductStatus, isAssetType, avgRating,
} from './types';

export type DbResultCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_CONFIGURED' | 'DB_ERROR';
export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: DbResultCode };
export function fail(e: unknown): { ok: false; error: string; code: DbResultCode } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.', code: 'DB_ERROR' };
}

const PROD_COLS = 'id, slug, title, summary, product_type, category_slug, publisher_id, status, featured, pinned, version, source_count, evidence_count, narrative_count, forecast_count, license_type, price_tier, published_at, created_at';

function mapProduct(r: Record<string, unknown>, publisherName: string | null): MarketplaceProduct {
  return {
    id: r.id as string, slug: r.slug as string, title: (r.title as string) ?? 'Product', summary: (r.summary as string) ?? null,
    productType: (isProductType(r.product_type) ? r.product_type : 'RESEARCH_REPORT') as ProductType,
    categorySlug: (r.category_slug as string) ?? null, publisherId: (r.publisher_id as string) ?? null, publisherName,
    status: (isProductStatus(r.status) ? r.status : 'draft') as ProductStatus,
    featured: (r.featured as boolean) ?? false, pinned: (r.pinned as boolean) ?? false, version: (r.version as number) ?? 1,
    sourceCount: (r.source_count as number) ?? 0, evidenceCount: (r.evidence_count as number) ?? 0,
    narrativeCount: (r.narrative_count as number) ?? 0, forecastCount: (r.forecast_count as number) ?? 0,
    licenseType: (r.license_type as string) ?? 'open', priceTier: (r.price_tier as string) ?? null,
    publishedAt: (r.published_at as string) ?? null, createdAt: r.created_at as string,
  };
}

async function publisherNames(c: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return map;
  try {
    const { data } = await c.from('marketplace_publishers').select('id, name').in('id', uniq);
    for (const r of (data ?? []) as Array<{ id: string; name: string }>) map.set(r.id, r.name);
  } catch { /* ignore */ }
  return map;
}

export interface ListOptions { status?: ProductStatus; productType?: ProductType; categorySlug?: string; publisherId?: string; featured?: boolean; search?: string; sort?: 'new' | 'title'; limit?: number }

export async function listProductsDal(c: SupabaseClient, opts: ListOptions = {}): Promise<MarketplaceProduct[]> {
  try {
    let q = c.from('marketplace_products').select(PROD_COLS);
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.productType) q = q.eq('product_type', opts.productType);
    if (opts.categorySlug) q = q.eq('category_slug', opts.categorySlug);
    if (opts.publisherId) q = q.eq('publisher_id', opts.publisherId);
    if (opts.featured) q = q.eq('featured', true);
    if (opts.search?.trim()) q = q.ilike('title', `%${opts.search.trim()}%`);
    q = opts.sort === 'title' ? q.order('title', { ascending: true }) : q.order('published_at', { ascending: false, nullsFirst: false });
    const { data } = await q.limit(opts.limit ?? 60);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const names = await publisherNames(c, rows.map((r) => r.publisher_id as string).filter(Boolean));
    return rows.map((r) => mapProduct(r, r.publisher_id ? names.get(r.publisher_id as string) ?? null : null));
  } catch { return []; }
}

export async function getProductBySlugDal(c: SupabaseClient, slug: string): Promise<MarketplaceProduct | null> {
  try {
    const { data } = await c.from('marketplace_products').select(PROD_COLS).eq('slug', slug).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    const names = await publisherNames(c, [r.publisher_id as string].filter(Boolean));
    return mapProduct(r, r.publisher_id ? names.get(r.publisher_id as string) ?? null : null);
  } catch { return null; }
}

export async function getProductByIdDal(c: SupabaseClient, id: string): Promise<MarketplaceProduct | null> {
  try {
    const { data } = await c.from('marketplace_products').select(PROD_COLS).eq('id', id).maybeSingle();
    if (!data) return null;
    const r = data as Record<string, unknown>;
    const names = await publisherNames(c, [r.publisher_id as string].filter(Boolean));
    return mapProduct(r, r.publisher_id ? names.get(r.publisher_id as string) ?? null : null);
  } catch { return null; }
}

// ---- assets / provenance ----------------------------------------------------

export async function listAssetsDal(c: SupabaseClient, productId: string): Promise<ProductAsset[]> {
  try {
    const { data } = await c.from('marketplace_product_assets').select('asset_type, asset_id, label').eq('product_id', productId).limit(500);
    return ((data ?? []) as Array<{ asset_type: string; asset_id: string; label: string | null }>)
      .filter((r) => isAssetType(r.asset_type))
      .map((r) => ({ assetType: r.asset_type as AssetType, assetId: r.asset_id, label: r.label }));
  } catch { return []; }
}

export async function insertAssetsDal(writer: SupabaseClient, productId: string, assets: { assetType: AssetType; assetId: string; label?: string }[]): Promise<void> {
  if (assets.length === 0) return;
  try { await writer.from('marketplace_product_assets').insert(assets.map((a) => ({ product_id: productId, asset_type: a.assetType, asset_id: a.assetId, label: a.label ?? null }))); } catch { /* best-effort */ }
}

/** Counts by asset family for provenance + denormalized product counts. */
export function countAssets(assets: ProductAsset[]): { source: number; evidence: number; narrative: number; forecast: number; publication: number; correction: number } {
  const out = { source: 0, evidence: 0, narrative: 0, forecast: 0, publication: 0, correction: 0 };
  for (const a of assets) {
    if (a.assetType === 'SOURCE') out.source += 1;
    else if (a.assetType === 'EVIDENCE' || a.assetType === 'GRAPH_NODE') out.evidence += 1;
    else if (a.assetType === 'NARRATIVE') out.narrative += 1;
    else if (a.assetType === 'FORECAST') out.forecast += 1;
    else if (a.assetType === 'PUBLICATION') out.publication += 1;
    else if (a.assetType === 'CORRECTION') out.correction += 1;
  }
  return out;
}

// ---- publishers / categories -----------------------------------------------

function mapPublisher(r: Record<string, unknown>): Publisher {
  return { id: r.id as string, name: (r.name as string) ?? 'Publisher', slug: (r.slug as string) ?? null, bio: (r.bio as string) ?? null, verified: (r.verified as boolean) ?? false, createdAt: r.created_at as string };
}
export async function getPublisherDal(c: SupabaseClient, id: string): Promise<Publisher | null> {
  try { const { data } = await c.from('marketplace_publishers').select('id, name, slug, bio, verified, created_at').eq('id', id).maybeSingle(); return data ? mapPublisher(data as Record<string, unknown>) : null; } catch { return null; }
}
export async function listPublishersDal(c: SupabaseClient, limit = 50): Promise<Publisher[]> {
  try { const { data } = await c.from('marketplace_publishers').select('id, name, slug, bio, verified, created_at').order('created_at', { ascending: false }).limit(limit); return ((data ?? []) as Array<Record<string, unknown>>).map(mapPublisher); } catch { return []; }
}
export async function insertPublisherDal(writer: SupabaseClient, input: { name: string; slug: string; bio?: string }, actorId: string): Promise<DbResult<{ id: string }>> {
  try { const { data, error } = await writer.from('marketplace_publishers').insert({ name: input.name, slug: input.slug, bio: input.bio ?? null, owner_id: actorId }).select('id').single(); if (error || !data) return fail(error ?? new Error('insert failed')); return { ok: true, data: { id: (data as { id: string }).id } }; } catch (e) { return fail(e); }
}

export async function listCategoriesDal(c: SupabaseClient): Promise<MarketplaceCategory[]> {
  try {
    const { data } = await c.from('marketplace_categories').select('slug, label, product_type, description, sort_order').order('sort_order', { ascending: true });
    return ((data ?? []) as Array<{ slug: string; label: string; product_type: string; description: string | null }>).map((r) => ({ slug: r.slug, label: r.label, productType: r.product_type, description: r.description }));
  } catch { return []; }
}

// ---- product writes (admin) -------------------------------------------------

export interface CreateProductInput {
  slug: string; title: string; summary?: string; description?: string; productType: ProductType;
  categorySlug?: string | null; publisherId?: string | null; licenseType?: string; priceTier?: string | null;
  subscriptionTier?: string | null; accessPolicy?: string;
  assets: { assetType: AssetType; assetId: string; label?: string }[];
}

export async function insertProductDal(writer: SupabaseClient, input: CreateProductInput, actorId: string): Promise<DbResult<{ id: string }>> {
  try {
    const { data, error } = await writer.from('marketplace_products').insert({
      slug: input.slug, title: input.title, summary: input.summary ?? null, description: input.description ?? null,
      product_type: input.productType, category_slug: input.categorySlug ?? null, publisher_id: input.publisherId ?? null,
      status: 'draft', license_type: input.licenseType ?? 'open', price_tier: input.priceTier ?? null,
      subscription_tier: input.subscriptionTier ?? null, access_policy: input.accessPolicy ?? 'public', created_by: actorId,
    }).select('id').single();
    if (error || !data) return fail(error ?? new Error('insert failed'));
    const id = (data as { id: string }).id;
    await insertAssetsDal(writer, id, input.assets);
    const counts = countAssets(input.assets.map((a) => ({ assetType: a.assetType, assetId: a.assetId, label: a.label ?? null })));
    await writer.from('marketplace_products').update({ source_count: counts.source, evidence_count: counts.evidence, narrative_count: counts.narrative, forecast_count: counts.forecast, provenance_summary: counts }).eq('id', id);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function setStatusDal(writer: SupabaseClient, id: string, status: ProductStatus): Promise<DbResult<{ id: string }>> {
  try {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'published') patch.published_at = new Date().toISOString();
    const { error } = await writer.from('marketplace_products').update(patch).eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function setFlagDal(writer: SupabaseClient, id: string, flag: 'featured' | 'pinned', value: boolean): Promise<DbResult<{ id: string }>> {
  try { const { error } = await writer.from('marketplace_products').update({ [flag]: value, updated_at: new Date().toISOString() }).eq('id', id); if (error) return fail(error); return { ok: true, data: { id } }; } catch (e) { return fail(e); }
}

export async function bumpVersionDal(writer: SupabaseClient, id: string, changelog: string, actorId: string): Promise<DbResult<{ version: number }>> {
  try {
    const cur = await getProductByIdDal(writer, id);
    if (!cur) return fail(new Error('not found'));
    const version = cur.version + 1;
    await writer.from('marketplace_versions').insert({ product_id: id, version, changelog, created_by: actorId });
    const { error } = await writer.from('marketplace_products').update({ version, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: { version } };
  } catch (e) { return fail(e); }
}

// ---- engagement -------------------------------------------------------------

export async function getAnalyticsDal(c: SupabaseClient, productId: string): Promise<ProductAnalytics> {
  try {
    const [{ count: downloads }, { count: views }, { count: favorites }] = await Promise.all([
      c.from('marketplace_downloads').select('id', { count: 'exact', head: true }).eq('product_id', productId).eq('kind', 'download'),
      c.from('marketplace_downloads').select('id', { count: 'exact', head: true }).eq('product_id', productId).eq('kind', 'view'),
      c.from('marketplace_favorites').select('id', { count: 'exact', head: true }).eq('product_id', productId),
    ]);
    let ratingCount = 0; let avg = 0;
    try {
      const { data } = await c.from('marketplace_ratings').select('rating').eq('product_id', productId).limit(2000);
      const ratings = ((data ?? []) as Array<{ rating: number }>).map((r) => r.rating);
      ratingCount = ratings.length; avg = avgRating(ratings);
    } catch { /* ignore */ }
    return { downloads: downloads ?? 0, views: views ?? 0, favorites: favorites ?? 0, ratingCount, avgRating: avg };
  } catch { return { downloads: 0, views: 0, favorites: 0, ratingCount: 0, avgRating: 0 }; }
}

export async function logEventDal(c: SupabaseClient, productId: string, kind: 'download' | 'view', userId: string | null): Promise<void> {
  try { await c.from('marketplace_downloads').insert({ product_id: productId, kind, user_id: userId }); } catch { /* best-effort */ }
}

export async function favoriteDal(c: SupabaseClient, productId: string, userId: string, on: boolean): Promise<DbResult<{ favorited: boolean }>> {
  try {
    if (on) { const { error } = await c.from('marketplace_favorites').upsert({ product_id: productId, user_id: userId }, { onConflict: 'product_id,user_id' }); if (error) return fail(error); }
    else { const { error } = await c.from('marketplace_favorites').delete().eq('product_id', productId).eq('user_id', userId); if (error) return fail(error); }
    return { ok: true, data: { favorited: on } };
  } catch (e) { return fail(e); }
}

export async function rateDal(c: SupabaseClient, productId: string, userId: string, rating: number, review: string | null): Promise<DbResult<{ rating: number }>> {
  try {
    const { error } = await c.from('marketplace_ratings').upsert({ product_id: productId, user_id: userId, rating, review, updated_at: new Date().toISOString() }, { onConflict: 'product_id,user_id' });
    if (error) return fail(error);
    return { ok: true, data: { rating } };
  } catch (e) { return fail(e); }
}

export { mapProduct };
