// =============================================================================
// Site-builder block definitions + per-type validation. PURE.
// =============================================================================

import type { BlockIssue, SiteBlock, SiteBlockDef, SiteBlockType } from './types';

export const SITE_BLOCK_DEFS: SiteBlockDef[] = [
  { type: 'hero', label: 'Hero', fields: ['headline', 'subheadline', 'ctaLabel', 'ctaHref'] },
  { type: 'cta', label: 'Call to action', fields: ['label', 'href'] },
  { type: 'feature_grid', label: 'Feature grid', fields: ['features'] },
  { type: 'card_grid', label: 'Card grid', fields: ['cards'] },
  { type: 'statistic', label: 'Statistic', fields: ['value', 'label'] },
  { type: 'testimonial', label: 'Testimonial', fields: ['quote', 'author', 'role'] },
  { type: 'image', label: 'Image', fields: ['url', 'alt'] },
  { type: 'video', label: 'Video', fields: ['url', 'title'] },
  { type: 'faq', label: 'FAQ', fields: ['items'] },
  { type: 'report_feed', label: 'Report feed', fields: ['limit', 'category'] },
];

export const SITE_BLOCK_TYPES: SiteBlockType[] = SITE_BLOCK_DEFS.map((d) => d.type);

export function isSiteBlockType(s: string): s is SiteBlockType {
  return (SITE_BLOCK_TYPES as string[]).includes(s);
}

export function defaultSiteBlockContent(type: SiteBlockType): Record<string, unknown> {
  switch (type) {
    case 'hero': return { headline: '', subheadline: '', ctaLabel: '', ctaHref: '' };
    case 'cta': return { label: '', href: '' };
    case 'feature_grid': return { features: [] };
    case 'card_grid': return { cards: [] };
    case 'statistic': return { value: '', label: '' };
    case 'testimonial': return { quote: '', author: '', role: '' };
    case 'image': return { url: '', alt: '' };
    case 'video': return { url: '', title: '' };
    case 'faq': return { items: [] };
    case 'report_feed': return { limit: 5, category: '' };
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isHttpish = (s: string): boolean => /^(https?:\/\/|\/)/.test(s);

/** Validate one block's content. Returns issues (empty = valid). PURE. */
export function validateSiteBlock(block: SiteBlock): BlockIssue[] {
  const issues: BlockIssue[] = [];
  const need = (field: string, ok: boolean, message: string) => { if (!ok) issues.push({ blockId: block.id, field, message }); };
  const c = block.content ?? {};
  switch (block.type) {
    case 'hero':
      need('headline', str(c.headline).trim().length > 0, 'Hero needs a headline.');
      if (str(c.ctaLabel).trim() && !str(c.ctaHref).trim()) need('ctaHref', false, 'Hero CTA label needs a link.');
      break;
    case 'cta':
      need('label', str(c.label).trim().length > 0, 'CTA needs a label.');
      need('href', isHttpish(str(c.href)), 'CTA needs a valid link.');
      break;
    case 'feature_grid':
      need('features', arr(c.features).length > 0, 'Feature grid needs at least one feature.');
      break;
    case 'card_grid':
      need('cards', arr(c.cards).length > 0, 'Card grid needs at least one card.');
      break;
    case 'statistic':
      need('value', str(c.value).trim().length > 0, 'Statistic needs a value.');
      need('label', str(c.label).trim().length > 0, 'Statistic needs a label.');
      break;
    case 'testimonial':
      need('quote', str(c.quote).trim().length > 0, 'Testimonial needs a quote.');
      need('author', str(c.author).trim().length > 0, 'Testimonial needs an author.');
      break;
    case 'image':
      need('url', isHttpish(str(c.url)), 'Image needs a valid URL.');
      need('alt', str(c.alt).trim().length > 0, 'Image needs alt text (accessibility).');
      break;
    case 'video':
      need('url', isHttpish(str(c.url)), 'Video needs a valid URL.');
      break;
    case 'faq':
      need('items', arr(c.items).length > 0, 'FAQ needs at least one item.');
      break;
    case 'report_feed': {
      const limit = Number(c.limit);
      need('limit', Number.isFinite(limit) && limit > 0 && limit <= 50, 'Report feed limit must be 1–50.');
      break;
    }
  }
  return issues;
}
