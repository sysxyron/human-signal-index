// =============================================================================
// Public app-domain URL helper.
//
// In production the marketing site (e.g. www.humansignalindex.org) and the app
// (app.humansignalindex.org) live on DIFFERENT origins, so PUBLIC marketing CTAs
// that send users into the app ("Explore Dashboard", "Sign in", …) must point at
// the app domain — NEXT_PUBLIC_APP_URL — not a relative path.
//
// INTERNAL dashboard navigation must stay RELATIVE (e.g. /dashboard/settings) so
// it works on whatever origin the app is served from. Use `appHref()` ONLY for
// public → app links; keep in-app links relative.
//
// PURE + CLIENT-SAFE: NEXT_PUBLIC_* is inlined at build time, so this resolves the
// same value on server and client.
// =============================================================================

/** The public base URL of the app. Falls back to localhost in dev. */
export function getPublicAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/** Build an absolute URL into the app for a PUBLIC marketing CTA. */
export function appHref(path = '/'): string {
  const base = getPublicAppUrl().replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
