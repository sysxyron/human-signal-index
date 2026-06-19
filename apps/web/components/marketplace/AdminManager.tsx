'use client';

// =============================================================================
// HSI Phase 69 — Marketplace admin manager (client, admin). Publish a product
// (packaging existing intelligence via asset links), and feature / archive /
// version existing products. Audited server actions. No intelligence is generated.
// =============================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Button } from '@hsi/ui';
import { Package, Star, Archive, GitFork } from 'lucide-react';
import { publishProductAction, featureProductAction, archiveProductAction, versionProductAction } from '@/lib/marketplace/actions';
import { PRODUCT_TYPES, PRODUCT_TYPE_LABEL, ASSET_TYPES, type ProductType, type AssetType } from '@/lib/marketplace/types';
import type { MarketplaceProduct } from '@/lib/marketplace/types';

type AssetLink = { assetType: AssetType; assetId: string; label?: string };
/** Parse "ASSET_TYPE:asset_id[:label]" lines into provenance asset links. */
function parseAssets(text: string): AssetLink[] {
  const out: AssetLink[] = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const [t, id, ...rest] = l.split(':');
    const at = (t ?? '').trim().toUpperCase();
    if (!ASSET_TYPES.includes(at as AssetType) || !id?.trim()) continue;
    const label = rest.join(':').trim();
    out.push(label ? { assetType: at as AssetType, assetId: id.trim(), label } : { assetType: at as AssetType, assetId: id.trim() });
  }
  return out;
}

export function PublishProductForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ProductType>('RESEARCH_REPORT');
  const [summary, setSummary] = useState('');
  const [assetsText, setAssetsText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () => start(async () => {
    setMsg(null);
    const categoryMap: Record<ProductType, string> = { RESEARCH_REPORT: 'research-report', FORECAST_PACKAGE: 'forecast-package', WATCHLIST: 'watchlist', SOURCE_COLLECTION: 'source-collection', NARRATIVE_PACKAGE: 'narrative-package', EVIDENCE_COLLECTION: 'evidence-collection', MONITORING_FEED: 'monitoring-feed', EXECUTIVE_BRIEF: 'executive-brief' };
    const r = await publishProductAction({ title, productType: type, summary: summary || undefined, categorySlug: categoryMap[type], assets: parseAssets(assetsText), publish: true });
    setMsg(r.ok ? 'Product published.' : (r.error ?? 'Failed.'));
    if (r.ok) { setTitle(''); setSummary(''); setAssetsText(''); router.refresh(); }
  });

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><Package className="h-4 w-4 text-electric" /><h3 className="text-h6 font-semibold text-text-primary">Publish an intelligence product</h3></div>
      <p className="text-caption text-text-muted">Products package existing HSI intelligence. Link real assets for provenance — one per line as <code>ASSET_TYPE:id:label</code> (e.g. <code>FORECAST:uuid:Q3 forecast</code>).</p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product title" aria-label="Title" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as ProductType)} className="rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Product type">{PRODUCT_TYPES.map((t) => <option key={t} value={t}>{PRODUCT_TYPE_LABEL[t]}</option>)}</select>
      </div>
      <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary (optional)" aria-label="Summary" />
      <textarea value={assetsText} onChange={(e) => setAssetsText(e.target.value)} placeholder={`Provenance asset links\nFORECAST:uuid:Q3 election forecast\nNARRATIVE:uuid:Replacement narrative`} rows={4} className="w-full rounded-btn border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary" aria-label="Asset links" />
      <div className="flex items-center gap-3"><Button variant="primary" disabled={pending || !title.trim()} onClick={submit}><Package className="h-4 w-4" /> Publish</Button>{msg ? <span className="text-caption text-text-muted">{msg}</span> : null}</div>
    </Card>
  );
}

export function ProductAdminRow({ product }: { product: MarketplaceProduct }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { setMsg(null); const r = await fn(); setMsg(r.ok ? ok : (r.error ?? 'Failed.')); if (r.ok) router.refresh(); });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-background-deep/40 px-3 py-2 text-body-sm">
      <a href={`/marketplace/${product.slug}`} className="min-w-0 flex-1 truncate text-electric hover:underline">{product.title}</a>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">{product.status} · v{product.version}</span>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => featureProductAction(product.id, !product.featured), product.featured ? 'Unfeatured.' : 'Featured.')}><Star className={`h-3.5 w-3.5 ${product.featured ? 'fill-warning text-warning' : ''}`} /></Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => versionProductAction(product.id, 'Manual version bump'), 'Versioned.')}><GitFork className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="sm" disabled={pending || product.status === 'archived'} onClick={() => run(() => archiveProductAction(product.id), 'Archived.')}><Archive className="h-3.5 w-3.5" /></Button>
      {msg ? <span className="shrink-0 text-caption text-text-muted">{msg}</span> : null}
    </li>
  );
}
