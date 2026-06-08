// =============================================================================
// providers/index.ts — assemble the provider set from config.
//
// In LIVE mode we wire every real provider; each gates itself via `enabled()`
// (key/email presence). In FIXTURE mode no network providers are created — the
// engine uses the FixtureProvider directly (see ../fixtures/chronid-sources.ts).
// =============================================================================

import type { EvidenceEngineConfig, EvidenceProvider } from '../types';
import { DEFAULT_NOW } from '../normalize';
import { createArxivProvider } from './arxiv';
import { createCrossrefProvider } from './crossref';
import { createPubmedProvider } from './pubmed';
import { createSemanticScholarProvider } from './semanticScholar';
import { createDoiProvider } from './doi';
import { createWebFallbackProvider, type WebFetcher } from './webFallback';

export { createArxivProvider } from './arxiv';
export { createCrossrefProvider } from './crossref';
export { createPubmedProvider } from './pubmed';
export { createSemanticScholarProvider } from './semanticScholar';
export { createDoiProvider } from './doi';
export { createWebFallbackProvider, type WebFetcher } from './webFallback';
export {
  fetchJson,
  fetchText,
  type FetchImpl,
  type MillisClock,
  type HttpResult,
  type HttpOptions,
} from './http';
export { httpOptionsFor, type ProviderDeps } from './deps';

import type { ProviderDeps } from './deps';

/**
 * Build the network provider list for a config. Pure with respect to `now`
 * (passed through to each provider so retrieved timestamps stay deterministic).
 * `webFetcher` is an optional host-provided web backend for the fallback;
 * `deps` injects fetch/clock/health/jitter (defaults are safe).
 *
 * Each created provider is also registered with the health tracker (if any) so
 * its enabled/disabled state is reflected even before any call is made.
 */
export function createProviders(
  cfg: EvidenceEngineConfig,
  now: string = DEFAULT_NOW,
  webFetcher?: WebFetcher,
  deps?: ProviderDeps,
): EvidenceProvider[] {
  const providers = [
    createArxivProvider(cfg, now, deps),
    createCrossrefProvider(cfg, now, deps),
    createPubmedProvider(cfg, now, deps),
    createSemanticScholarProvider(cfg, now, deps),
    createDoiProvider(cfg, now, deps),
    createWebFallbackProvider(cfg, now, webFetcher, deps),
  ];
  if (deps?.healthTracker) {
    for (const p of providers) deps.healthTracker.register(p.name, p.enabled());
  }
  return providers;
}
