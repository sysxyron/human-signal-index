// =============================================================================
// @hsi/cms-engine — types. PURE (no DB, no UI, no Date.now()).
//
// The CMS makes content operator-managed: pages built from blocks, a draft→
// review→published→archived workflow, immutable revisions with rollback, and SEO
// metadata. GOVERNANCE: the engine validates + assembles content only; it never
// touches RBAC. Publishing authority (admin-only) is enforced at the DAL/RLS.
// =============================================================================

export type PageType =
  | 'landing'
  | 'content'
  | 'report'
  | 'knowledge'
  | 'legal'
  | 'help';

export type BlockType =
  | 'hero'
  | 'rich_text'
  | 'image'
  | 'quote'
  | 'cta'
  | 'faq'
  | 'divider'
  | 'card_grid';

export type PageStatus = 'draft' | 'review' | 'published' | 'archived';

export interface SeoMeta {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
}

export interface CmsBlock {
  id: string;
  type: BlockType;
  position: number;
  /** Block-type-specific content (validated by the engine). */
  content: Record<string, unknown>;
}

export interface CmsPage {
  id: string;
  slug: string;
  pageType: PageType;
  title: string;
  status: PageStatus;
  seo?: SeoMeta;
  updatedAt?: string;
  publishedAt?: string | null;
}

/** A page + its ordered blocks (the editable unit). */
export interface PageDraft {
  page: CmsPage;
  blocks: CmsBlock[];
}

/** Assembled, render-ready page. */
export interface BuiltPage {
  page: CmsPage;
  blocks: CmsBlock[];
  seo: Required<Pick<SeoMeta, 'title' | 'description'>> & SeoMeta;
}

export interface ValidationIssue {
  blockId?: string;
  field?: string;
  message: string;
}
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** An immutable snapshot for version history / rollback. */
export interface CmsRevision {
  id: string;
  pageId: string;
  author: string;
  changeSummary: string;
  at: string;
  snapshot: PageDraft;
}

/** A searchable content item (page/block/template/media), for CMS search. */
export interface SearchableItem {
  kind: 'page' | 'block' | 'template' | 'media';
  id: string;
  title: string;
  text: string;
}
