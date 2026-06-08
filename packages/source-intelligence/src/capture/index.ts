// =============================================================================
// @hsi/source-intelligence — capture orchestration.
//
// createCaptureProviders(deps) builds the set of providers keyed by sourceType.
// captureSource(source, deps) routes a RegisteredSource/SourceInput to the right
// provider and returns a CaptureResult. NEVER throws.
// =============================================================================

import type { RegisteredSource } from '../registry';
import type { CaptureProvider, CaptureResult, SourceInput } from '../types';
import { type CaptureDeps } from './fetchDeps';
import { documentProvider } from './documentProvider';
import { rssProvider } from './rssProvider';
import { websiteProvider } from './websiteProvider';

export * from './fetchDeps';
export * from './websiteProvider';
export * from './rssProvider';
export * from './documentProvider';
export * from './manualProvider';

/** Extra providers (e.g. fixtures) merged into the routing map. */
export interface CaptureProviderOptions {
  /** Additional/override providers keyed by sourceType. */
  extraProviders?: CaptureProvider[];
}

/**
 * Build the default provider map. website/rss are network-capable (gated by
 * deps); document is offline. youtube/tiktok/podcast/forum fall through to the
 * website provider for public-page capture unless an extra provider overrides.
 */
export function createCaptureProviders(
  deps?: CaptureDeps,
  options?: CaptureProviderOptions,
): Map<string, CaptureProvider> {
  const map = new Map<string, CaptureProvider>();
  const web = websiteProvider(deps);
  const rss = rssProvider(deps);
  const doc = documentProvider();

  map.set('website', web);
  map.set('rss', rss);
  map.set('document', doc);
  // Public-page fallbacks for platform sources (public surfaces only).
  map.set('youtube', web);
  map.set('tiktok', web);
  map.set('podcast', rss);
  map.set('forum', web);

  for (const p of options?.extraProviders ?? []) {
    map.set(String(p.sourceType), p);
  }
  return map;
}

/** Pick the URL to capture for a source (rss feeds prefer rssUrl). */
function urlFor(source: SourceInput): string | undefined {
  if (String(source.sourceType) === 'rss' || String(source.sourceType) === 'podcast') {
    return source.rssUrl ?? source.homepageUrl;
  }
  return source.homepageUrl ?? source.rssUrl;
}

/**
 * Route a source to its provider and capture once. Returns { ok:false } (never
 * throws) when no provider matches or the provider is disabled.
 */
export async function captureSource(
  source: SourceInput | RegisteredSource,
  deps?: CaptureDeps,
  options?: CaptureProviderOptions,
  now: string = '1970-01-01T00:00:00.000Z',
): Promise<CaptureResult> {
  const providers = createCaptureProviders(deps, options);
  const provider = providers.get(String(source.sourceType));
  if (!provider) {
    return {
      ok: false,
      provider: `route:${String(source.sourceType)}`,
      error: `no capture provider for sourceType "${source.sourceType}"`,
    };
  }
  if (!provider.enabled()) {
    return { ok: false, provider: provider.name, error: 'provider disabled' };
  }
  try {
    return await provider.capture({ url: urlFor(source), now });
  } catch (e) {
    // Defense in depth — providers already swallow errors, but never let one out.
    return {
      ok: false,
      provider: provider.name,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
