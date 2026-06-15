// =============================================================================
// Deterministic demo CMS content for OFFLINE admin views + tests. No randomness.
// =============================================================================

import type { CmsBlock, CmsPage, PageDraft } from './types';

export const demoPage: CmsPage = {
  id: 'page_home', slug: 'home', pageType: 'landing', title: 'Human Signal Index',
  status: 'published', seo: { title: 'Human Signal Index', description: 'A governed contributor intelligence network.', keywords: ['osint', 'intelligence', 'verification'] },
  updatedAt: '2026-06-12T10:00:00Z', publishedAt: '2026-06-12T10:00:00Z',
};

export const demoBlocks: CmsBlock[] = [
  { id: 'b1', type: 'hero', position: 0, content: { heading: 'Signal over noise', subheading: 'Verified, governed, traceable intelligence.', ctaLabel: 'Explore reports', ctaHref: '/public-reports' } },
  { id: 'b2', type: 'rich_text', position: 1, content: { markdown: 'HSI turns scattered signals into accountable findings.' } },
  { id: 'b3', type: 'cta', position: 2, content: { label: 'Become a contributor', href: '/sign-up' } },
];

export const demoDraft: PageDraft = { page: demoPage, blocks: demoBlocks };

export const demoPages: CmsPage[] = [
  demoPage,
  { id: 'page_about', slug: 'about', pageType: 'content', title: 'About HSI', status: 'draft', updatedAt: '2026-06-13T09:00:00Z' },
  { id: 'page_faq', slug: 'faq', pageType: 'help', title: 'FAQ', status: 'review', updatedAt: '2026-06-11T09:00:00Z' },
];
