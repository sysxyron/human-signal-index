// =============================================================================
// GET /api/public/marketplace — Phase 69 public marketplace read API.
//
// Read-only, anonymous-safe, rate-limited. Returns the published catalog (or a
// single product via ?slug=, or a search via ?q=). PUBLIC-SAFE: published products
// only, no drafts, no service-role exposure, no unpublished leakage. Never throws.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit, clientKeyFromHeaders, pruneRateLimit } from '@/lib/rate-limit';
import { getMarketplaceCatalog, getProductDetail } from '@/lib/marketplace/data';
import { searchMarketplace } from '@/lib/marketplace/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  pruneRateLimit();
  const rl = rateLimit(`pub-marketplace:${clientKeyFromHeaders(request.headers)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json({ ok: false, error: 'Rate limit exceeded. Please try again shortly.' }, { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const q = url.searchParams.get('q');
  const headers = { 'cache-control': 'public, max-age=120, stale-while-revalidate=300', 'x-ratelimit-limit': String(rl.limit), 'x-ratelimit-remaining': String(rl.remaining) };

  try {
    if (slug) {
      const detail = await getProductDetail(slug);
      if (!detail) return NextResponse.json({ ok: false, error: 'Not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } });
      return NextResponse.json({ ok: true, product: detail.product, provenance: detail.provenance, analytics: detail.analytics }, { status: 200, headers });
    }
    if (q) {
      const results = await searchMarketplace(q);
      return NextResponse.json({ ok: true, results }, { status: 200, headers });
    }
    const catalog = await getMarketplaceCatalog();
    return NextResponse.json({ ok: true, featured: catalog.featured, trending: catalog.trending, newest: catalog.newest, categories: catalog.categories, totalProducts: catalog.totalProducts }, { status: 200, headers });
  } catch {
    return NextResponse.json({ ok: true, featured: [], trending: [], newest: [], categories: [], totalProducts: 0 }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }
}
