// =============================================================================
// Block definitions + per-type validation (Deliverable 5). PURE.
// =============================================================================

import type { BlockType, CmsBlock, ValidationIssue } from './types';

export const BLOCK_TYPES: BlockType[] = [
  'hero', 'rich_text', 'image', 'quote', 'cta', 'faq', 'divider', 'card_grid',
];

export function isBlockType(s: string): s is BlockType {
  return (BLOCK_TYPES as string[]).includes(s);
}

/** A sensible empty content shape per block type (for the editor's "add block"). */
export function defaultBlockContent(type: BlockType): Record<string, unknown> {
  switch (type) {
    case 'hero': return { heading: '', subheading: '', ctaLabel: '', ctaHref: '' };
    case 'rich_text': return { markdown: '' };
    case 'image': return { url: '', alt: '' };
    case 'quote': return { text: '', attribution: '' };
    case 'cta': return { label: '', href: '' };
    case 'faq': return { items: [] };
    case 'divider': return {};
    case 'card_grid': return { cards: [] };
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Validate a single block's content. Returns issues (empty = valid). PURE. */
export function validateBlock(block: CmsBlock): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const need = (field: string, ok: boolean, message: string) => { if (!ok) issues.push({ blockId: block.id, field, message }); };
  const c = block.content ?? {};
  switch (block.type) {
    case 'hero':
      need('heading', str(c.heading).trim().length > 0, 'Hero needs a heading.');
      if (str(c.ctaLabel).trim() && !str(c.ctaHref).trim()) need('ctaHref', false, 'Hero CTA label needs a link.');
      break;
    case 'rich_text':
      need('markdown', str(c.markdown).trim().length > 0, 'Rich text block is empty.');
      break;
    case 'image':
      need('url', str(c.url).trim().length > 0, 'Image block needs a URL.');
      need('alt', str(c.alt).trim().length > 0, 'Image needs alt text (accessibility).');
      break;
    case 'quote':
      need('text', str(c.text).trim().length > 0, 'Quote is empty.');
      break;
    case 'cta':
      need('label', str(c.label).trim().length > 0, 'CTA needs a label.');
      need('href', str(c.href).trim().length > 0, 'CTA needs a link.');
      break;
    case 'faq':
      need('items', Array.isArray(c.items) && (c.items as unknown[]).length > 0, 'FAQ needs at least one item.');
      break;
    case 'card_grid':
      need('cards', Array.isArray(c.cards) && (c.cards as unknown[]).length > 0, 'Card grid needs at least one card.');
      break;
    case 'divider':
      break;
  }
  return issues;
}
