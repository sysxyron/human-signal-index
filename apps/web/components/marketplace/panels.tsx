// =============================================================================
// HSI Phase 69 — Marketplace presentational components (server, public). Product
// cards, grids, category chips, publisher lists, provenance + analytics panels.
// Public-safe; read-only; no client interactivity here.
// =============================================================================

import { Card } from '@hsi/ui';
import { FileText, GitFork, Layers, Target, Download, Star, Eye, Heart, ShieldCheck, ArrowUpRight } from 'lucide-react';
import type { MarketplaceProduct, Publisher, MarketplaceCategory, ProductProvenance, ProductAnalytics } from '@/lib/marketplace/types';
import { PRODUCT_TYPE_LABEL, type ProductType } from '@/lib/marketplace/types';

const n = (v: number) => v.toLocaleString('en-US');
const productHref = (slug: string) => `/marketplace/${slug}`;
const publisherHref = (id: string) => `/marketplace/publishers/${id}`;

const TYPE_ICON: Record<ProductType, typeof FileText> = {
  RESEARCH_REPORT: FileText, FORECAST_PACKAGE: Target, WATCHLIST: Eye, SOURCE_COLLECTION: ShieldCheck,
  NARRATIVE_PACKAGE: Layers, EVIDENCE_COLLECTION: GitFork, MONITORING_FEED: Eye, EXECUTIVE_BRIEF: FileText,
};

export function ProductTypeBadge({ type }: { type: ProductType }) {
  return <span className="inline-flex shrink-0 rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">{PRODUCT_TYPE_LABEL[type]}</span>;
}

export function ProductCard({ product }: { product: MarketplaceProduct }) {
  const Icon = TYPE_ICON[product.productType] ?? FileText;
  return (
    <a href={productHref(product.slug)} className="block rounded-card border border-border bg-surface/80 p-4 transition hover:border-electric/60">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-electric/15 text-electric"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text-primary">{product.title}</span>
        {product.featured ? <Star className="h-3.5 w-3.5 shrink-0 text-warning" /> : null}
      </div>
      {product.summary ? <p className="mt-2 line-clamp-2 text-caption text-text-secondary">{product.summary}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
        <ProductTypeBadge type={product.productType} />
        {product.publisherName ? <span>by {product.publisherName}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-text-muted">
        <span>{n(product.sourceCount)} sources</span>
        <span>{n(product.evidenceCount)} evidence</span>
        <span>{n(product.narrativeCount)} narratives</span>
        <span>{n(product.forecastCount)} forecasts</span>
      </div>
    </a>
  );
}

export function ProductGrid({ products, empty = 'No products yet.' }: { products: MarketplaceProduct[]; empty?: string }) {
  if (products.length === 0) return <p className="rounded-card border border-dashed border-border/70 bg-background-deep/30 px-4 py-8 text-center text-caption text-text-muted">{empty}</p>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>;
}

export function CategoryChips({ categories, active }: { categories: MarketplaceCategory[]; active?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a href="/marketplace" className={`rounded-btn border px-3 py-1.5 text-caption font-semibold transition ${!active ? 'border-electric bg-electric/10 text-electric' : 'border-border bg-surface-2/40 text-text-secondary hover:border-electric'}`}>All</a>
      {categories.map((cat) => (
        <a key={cat.slug} href={`/marketplace?category=${cat.slug}`} className={`rounded-btn border px-3 py-1.5 text-caption font-semibold transition ${active === cat.slug ? 'border-electric bg-electric/10 text-electric' : 'border-border bg-surface-2/40 text-text-secondary hover:border-electric'}`}>{cat.label}{typeof cat.count === 'number' ? ` (${cat.count})` : ''}</a>
      ))}
    </div>
  );
}

export function TopPublishers({ rows }: { rows: { publisher: Publisher; productCount: number }[] }) {
  return (
    <Card className="space-y-3">
      <h3 className="text-h6 font-semibold text-text-primary">Top publishers</h3>
      {rows.length === 0 ? <p className="text-caption text-text-muted">No publishers yet.</p> : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.publisher.id} className="flex items-center gap-2 text-body-sm">
              <a href={publisherHref(r.publisher.id)} className="min-w-0 flex-1 truncate text-electric hover:underline">{r.publisher.name}</a>
              {r.publisher.verified ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-verified" /> : null}
              <span className="shrink-0 text-caption text-text-muted">{r.productCount} products</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ProvenancePanel({ provenance, links }: { provenance: ProductProvenance; links: { label: string; href: string }[] }) {
  const tiles = [
    { label: 'Sources', value: provenance.sources }, { label: 'Evidence', value: provenance.evidence },
    { label: 'Narratives', value: provenance.narratives }, { label: 'Forecasts', value: provenance.forecasts },
    { label: 'Publications', value: provenance.publications }, { label: 'Corrections', value: provenance.corrections },
  ];
  return (
    <Card className="space-y-4">
      <h3 className="text-h6 font-semibold text-text-primary">Provenance</h3>
      <p className="text-caption text-text-muted">Every number is computed from the real intelligence assets this product packages — nothing is fabricated.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => <div key={t.label} className="rounded-card border border-border bg-background-deep/40 px-3 py-2 text-center"><div className="text-h6 font-bold tabular-nums text-text-primary">{n(t.value)}</div><div className="text-[10px] uppercase tracking-wide text-text-muted">{t.label}</div></div>)}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {links.map((l) => <a key={l.href} href={l.href} className="inline-flex items-center gap-1 rounded-btn border border-border bg-surface-2/40 px-3 py-1.5 text-caption font-semibold text-electric transition hover:border-electric">{l.label} <ArrowUpRight className="h-3.5 w-3.5" /></a>)}
      </div>
    </Card>
  );
}

export function AnalyticsTiles({ analytics }: { analytics: ProductAnalytics }) {
  const tiles = [
    { label: 'Downloads', value: analytics.downloads, icon: Download }, { label: 'Views', value: analytics.views, icon: Eye },
    { label: 'Favorites', value: analytics.favorites, icon: Heart }, { label: 'Rating', value: analytics.avgRating, icon: Star, suffix: ` (${analytics.ratingCount})` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => { const Icon = t.icon; return (
        <Card key={t.label} className="text-center">
          <Icon className="mx-auto h-4 w-4 text-text-muted" />
          <div className="mt-1 text-h6 font-bold tabular-nums text-text-primary">{n(t.value)}{t.suffix ?? ''}</div>
          <div className="text-[10px] uppercase tracking-wide text-text-muted">{t.label}</div>
        </Card>
      ); })}
    </div>
  );
}
