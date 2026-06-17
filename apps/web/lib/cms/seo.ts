// =============================================================================
// HSI Phase 41B.3 (E) — CMS SEO model + mapper (PURE, server-safe).
//
// CMS pages store SEO in the cms_pages.seo jsonb. This is the single place that
// turns a (possibly partial) CMS SEO record into Next.js Metadata, ALWAYS falling
// back to the page's hardcoded defaults so metadata is never empty. Pages call
// cmsSeoToMetadata(cms?.seo, fallback) from generateMetadata.
// =============================================================================

import type { Metadata } from 'next';

/** Superset of the engine SeoMeta — extra keys live in the jsonb. */
export interface CmsSeo {
  title?: string;
  description?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  keywords?: string[];
  noindex?: boolean;
}

export interface SeoFallback {
  title: string;
  description: string;
  /** Relative canonical path used when the CMS record has none. */
  path?: string;
}

/** Build Next Metadata from CMS SEO + fallback. CMS values win; gaps fall back. PURE. */
export function cmsSeoToMetadata(seo: CmsSeo | null | undefined, fallback: SeoFallback): Metadata {
  const s = seo ?? {};
  const title = (s.title && s.title.trim()) || fallback.title;
  const description = (s.description && s.description.trim()) || fallback.description;
  const canonical = (s.canonical && s.canonical.trim()) || fallback.path;
  const ogTitle = (s.ogTitle && s.ogTitle.trim()) || title;
  const ogDescription = (s.ogDescription && s.ogDescription.trim()) || description;

  const meta: Metadata = {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      ...(s.ogImage ? { images: [{ url: s.ogImage }] } : {}),
    },
  };
  if (canonical) meta.alternates = { canonical };
  if (s.keywords && s.keywords.length) meta.keywords = s.keywords;
  if (s.noindex) meta.robots = { index: false, follow: false };
  return meta;
}
