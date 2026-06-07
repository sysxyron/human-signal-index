// =============================================================================
// @hsi/source-connectors — URL normalization.
// =============================================================================

/** Normalize a URL for dedupe/identity: drop hash + common tracking params. */
export function normalizeSourceUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    const stripPrefixes = ['utm_', 'fbclid', 'gclid', 'mc_', 'ref_'];
    for (const key of [...parsed.searchParams.keys()]) {
      if (stripPrefixes.some((p) => key.toLowerCase().startsWith(p))) {
        parsed.searchParams.delete(key);
      }
    }
    // Drop trailing slash on path (but keep root).
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}
