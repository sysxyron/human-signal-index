// =============================================================================
// HSI Phase 41B.3A — bespoke (platform-owned) page guard. PURE, server-safe.
//
// Home and About are platform-owned: their structured React templates ALWAYS
// render. CMS can never replace their layout with generic blocks — it may only
// fill a small set of APPROVED content slots (currently the hero heading +
// subheading; SEO is handled separately via cmsSeoToMetadata). Unknown, extra,
// or malformed CMS blocks are ignored, so an invalid or accidentally-published
// CMS page can never corrupt these layouts. No "refresh seeded content" needed.
// =============================================================================

/** Slugs whose hardcoded template always wins over CMS blocks. */
export const BESPOKE_SLUGS = new Set<string>(['home', 'about']);

/** Is this slug a platform-owned page (template always renders)? PURE. */
export function isBespokePage(slug: string): boolean {
  return BESPOKE_SLUGS.has(slug);
}

/** A loose CMS block shape (only what slot extraction needs). */
export interface BlockLike {
  type?: string;
  content?: unknown;
}

/** The approved content slots a bespoke template accepts — all optional. */
export interface BespokeSlots {
  heroHeading?: string;
  heroSubheading?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Extract approved slots from a CMS page's blocks. Only the FIRST `hero` block's
 * heading/subheading are read; everything else is ignored. Never throws —
 * malformed input yields an empty slot set (template defaults render). PURE.
 */
export function extractBespokeSlots(blocks: BlockLike[] | null | undefined): BespokeSlots {
  const slots: BespokeSlots = {};
  if (!Array.isArray(blocks)) return slots;
  const hero = blocks.find((b) => b && b.type === 'hero');
  const content = hero && typeof hero.content === 'object' && hero.content ? (hero.content as Record<string, unknown>) : null;
  if (content) {
    const heading = str(content.heading);
    const subheading = str(content.subheading);
    if (heading) slots.heroHeading = heading;
    if (subheading) slots.heroSubheading = subheading;
  }
  return slots;
}

export interface BespokeResolution {
  /** Always true for bespoke slugs: the hardcoded template renders, never raw blocks. */
  usesTemplate: boolean;
  slots: BespokeSlots;
}

/**
 * Resolve how to render a slug given an optional published CMS page. For bespoke
 * slugs the template ALWAYS renders (usesTemplate true) and only approved slots
 * are taken from CMS; for other slugs the caller decides. PURE — this is the
 * single guard the Home/About pages use, and the contract the tests assert.
 */
export function resolveBespokeContent(
  slug: string,
  page: { blocks?: BlockLike[] } | null | undefined,
): BespokeResolution {
  if (!isBespokePage(slug)) return { usesTemplate: false, slots: {} };
  return { usesTemplate: true, slots: extractBespokeSlots(page?.blocks) };
}
