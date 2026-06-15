// =============================================================================
// @hsi/site-builder — types. PURE (no DB, no UI, no Date.now()).
//
// The operator site-builder block vocabulary used across all CMS pages. Richer
// than the base cms-engine blocks: it adds statistics, testimonials, video, and a
// dynamic report-feed. The package validates + serialises blocks; rendering lives
// in the web app. GOVERNANCE: content only — never touches RBAC.
// =============================================================================

export type SiteBlockType =
  | 'hero'
  | 'cta'
  | 'feature_grid'
  | 'card_grid'
  | 'statistic'
  | 'testimonial'
  | 'image'
  | 'video'
  | 'faq'
  | 'report_feed';

export interface SiteBlock {
  id: string;
  type: SiteBlockType;
  position: number;
  content: Record<string, unknown>;
}

export interface BlockIssue { blockId?: string; field?: string; message: string }
export interface BlockValidation { ok: boolean; issues: BlockIssue[] }

export interface SiteBlockDef {
  type: SiteBlockType;
  label: string;
  /** Content fields, for editor introspection. */
  fields: string[];
}
