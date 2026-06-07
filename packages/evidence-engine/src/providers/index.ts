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

/**
 * Build the network provider list for a config. Pure with respect to `now`
 * (passed through to each provider so retrieved timestamps stay deterministic).
 * `webFetcher` is an optional host-provided web backend for the fallback.
 */
export function createProviders(
  cfg: EvidenceEngineConfig,
  now: string = DEFAULT_NOW,
  webFetcher?: WebFetcher,
): EvidenceProvider[] {
  return [
    createArxivProvider(cfg, now),
    createCrossrefProvider(cfg, now),
    createPubmedProvider(cfg, now),
    createSemanticScholarProvider(cfg, now),
    createDoiProvider(cfg, now),
    createWebFallbackProvider(cfg, now, webFetcher),
  ];
}
