// =============================================================================
// HSI Phase 69 — Marketplace service API (SERVER-ONLY). Public reads (published-
// only) via readPublicClient; signed-in users favorite/rate via the cookie RLS
// client; admins publish/archive/feature via the admin client. RLS is the real
// boundary. Never throws.
// =============================================================================

import { createClient, getUser } from '@/lib/supabase/server';
import { loadHighestRole } from '@/lib/auth/get-session-role';
import { hasRole } from '@/lib/security/rbac-audit';
import { getServiceClient } from '@/lib/admin/guard';
import { readPublicClient } from '@/lib/public-intelligence';
import * as dal from './persistence';
import type { DbResult, CreateProductInput, ListOptions } from './persistence';
import type { MarketplaceProduct, Publisher } from './types';
import { slugify } from './types';

async function authedCtx() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' as const };
  return { ok: true as const, userId: user.id, db: createClient() };
}
async function adminWriter() {
  const user = await getUser();
  if (!user) return { ok: false as const, error: 'Sign in to continue.', code: 'AUTH_REQUIRED' as const };
  const db = createClient();
  const role = await loadHighestRole(db, user.id).catch(() => null);
  if (!hasRole(role ?? undefined, 'admin')) return { ok: false as const, error: 'Marketplace administration is admin-only.', code: 'FORBIDDEN' as const };
  return { ok: true as const, userId: user.id, writer: (await getServiceClient()) ?? db };
}

// ---- public reads (published only) -----------------------------------------

export async function getMarketplaceProducts(opts: Omit<ListOptions, 'status'> = {}): Promise<MarketplaceProduct[]> {
  const c = readPublicClient();
  if (!c) return [];
  return dal.listProductsDal(c, { ...opts, status: 'published' });
}

export async function getMarketplaceProduct(slug: string): Promise<MarketplaceProduct | null> {
  const c = readPublicClient();
  if (!c) return null;
  const p = await dal.getProductBySlugDal(c, slug);
  return p && p.status === 'published' ? p : null;
}

export async function searchMarketplace(q: string): Promise<MarketplaceProduct[]> {
  return getMarketplaceProducts({ search: q, limit: 50 });
}

export async function getFeaturedProducts(): Promise<MarketplaceProduct[]> {
  return getMarketplaceProducts({ featured: true, limit: 12 });
}

export async function getPublisherProducts(publisherId: string): Promise<MarketplaceProduct[]> {
  return getMarketplaceProducts({ publisherId, limit: 60 });
}

/** Trending = published products ranked by real engagement (downloads + favorites×2). */
export async function getTrendingProducts(): Promise<MarketplaceProduct[]> {
  const c = readPublicClient();
  if (!c) return [];
  const products = await dal.listProductsDal(c, { status: 'published', limit: 100 });
  if (products.length === 0) return [];
  const score = new Map<string, number>();
  try {
    const { data: dls } = await c.from('marketplace_downloads').select('product_id').limit(20000);
    for (const r of (dls ?? []) as Array<{ product_id: string }>) score.set(r.product_id, (score.get(r.product_id) ?? 0) + 1);
    const { data: favs } = await c.from('marketplace_favorites').select('product_id').limit(20000);
    for (const r of (favs ?? []) as Array<{ product_id: string }>) score.set(r.product_id, (score.get(r.product_id) ?? 0) + 2);
  } catch { /* ignore */ }
  return [...products].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)).slice(0, 12);
}

export async function getPublisher(id: string): Promise<Publisher | null> {
  const c = readPublicClient();
  if (!c) return null;
  return dal.getPublisherDal(c, id);
}

/** Admin console — every product including drafts/archived (admin-gated). */
export async function getAdminProducts(): Promise<DbResult<MarketplaceProduct[]>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return { ok: true, data: await dal.listProductsDal(a.writer, { sort: 'new', limit: 200 }) };
}

// ---- admin mutations --------------------------------------------------------

export async function publishMarketplaceProduct(input: Omit<CreateProductInput, 'slug'> & { slug?: string; publish?: boolean }): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  if (!input.title?.trim()) return { ok: false, error: 'A product title is required.', code: 'DB_ERROR' };
  const slug = (input.slug?.trim() || slugify(input.title)) + '-' + Math.abs(hashCode(input.title + Date.now().toString())).toString(36).slice(0, 5);
  const created = await dal.insertProductDal(a.writer, { ...input, slug }, a.userId);
  if (!created.ok) return created;
  if (input.publish !== false) await dal.setStatusDal(a.writer, created.data.id, 'published');
  return created;
}

export async function archiveMarketplaceProduct(id: string): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return dal.setStatusDal(a.writer, id, 'archived');
}

export async function setProductStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return dal.setStatusDal(a.writer, id, status);
}

export async function featureProduct(id: string, value: boolean): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return dal.setFlagDal(a.writer, id, 'featured', value);
}

export async function pinProduct(id: string, value: boolean): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return dal.setFlagDal(a.writer, id, 'pinned', value);
}

export async function versionProduct(id: string, changelog: string): Promise<DbResult<{ version: number }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  return dal.bumpVersionDal(a.writer, id, changelog, a.userId);
}

export async function createPublisher(name: string, bio?: string): Promise<DbResult<{ id: string }>> {
  const a = await adminWriter();
  if (!a.ok) return a;
  if (!name.trim()) return { ok: false, error: 'Publisher name is required.', code: 'DB_ERROR' };
  return dal.insertPublisherDal(a.writer, { name, slug: slugify(name), bio }, a.userId);
}

// ---- authed engagement ------------------------------------------------------

export async function favoriteProduct(productId: string, on: boolean): Promise<DbResult<{ favorited: boolean }>> {
  const c = await authedCtx();
  if (!c.ok) return c;
  return dal.favoriteDal(c.db, productId, c.userId, on);
}

export async function rateProduct(productId: string, rating: number, review?: string): Promise<DbResult<{ rating: number }>> {
  const c = await authedCtx();
  if (!c.ok) return c;
  if (!(rating >= 1 && rating <= 5)) return { ok: false, error: 'Rating must be 1–5.', code: 'DB_ERROR' };
  return dal.rateDal(c.db, productId, c.userId, Math.round(rating), review ?? null);
}

function hashCode(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }
