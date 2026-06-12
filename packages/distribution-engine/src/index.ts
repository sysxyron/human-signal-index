// =============================================================================
// @hsi/distribution-engine — public entry point (WorldForge/HSI Phase 19).
//
// DIGEST + DISTRIBUTION: generate subscriber digests (daily / weekly / topic),
// build publication feeds (RSS / JSON / Webhook), and plan distribution. It NEVER
// distributes UNPUBLISHED intelligence and NEVER generates a digest entry without
// a source reference. NO Date.now()/Math.random(); `now` is injected.
//
// __examples__
//   import { distributionDemo } from '@hsi/distribution-engine';
//   const out = distributionDemo();
//   console.log(out.rss.itemCount); // published items only
// =============================================================================

export * from './types';
export * from './digest';
export * from './feeds';
export * from './distribution';
export * from './fixtures';
