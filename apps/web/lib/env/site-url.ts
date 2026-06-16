// =============================================================================
// Public MARKETING-domain URL helper (companion to app-url.ts).
//
// Both www.humansignalindex.org (marketing) and app.humansignalindex.org (the
// app) are attached to the SAME Vercel project, so every marketing page also
// renders on the app origin. To keep PUBLIC marketing navigation on the
// marketing domain, marketing links resolve through siteHref(): in production
// (NEXT_PUBLIC_SITE_URL set) they become absolute www URLs, so a visitor who
// lands on app.* is sent back to www.* for marketing pages. In dev/preview
// (unset) they stay RELATIVE so localhost and preview URLs keep working.
//
// Pairing:
//   * siteHref()  → marketing pages on the www marketing origin.
//   * appHref()   → Dashboard / Login / Signup and other app-only routes on app.*.
//
// PURE + CLIENT-SAFE: NEXT_PUBLIC_* is inlined at build time.
// =============================================================================

/** The public marketing base URL, or '' when unset (dev/preview → relative). */
export function getPublicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

/** Resolve a marketing path to the www origin (absolute in prod, relative otherwise). */
export function siteHref(path = '/'): string {
  const base = getPublicSiteUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
