// =============================================================================
// @hsi/publishing-engine — public entry point (WorldForge/HSI Phase 19).
//
// PUBLIC INTELLIGENCE PUBLISHING: the publication lifecycle state machine,
// governance publishing controls (canPublish / publishReview / audit trail), the
// explainable intelligence REPORT builder, and the RETRACTION system. Turns a
// governed research run into a publishable, traceable, trust-aware report —
// NOTHING is publishable without human approval. No auto-publish, no auto-truth,
// no black-box content.
//
// PRINCIPLES (binding):
//   * PURE & DETERMINISTIC — callers inject `now`; NO Date.now()/Math.random().
//   * OFFLINE — fixtures + local heuristics; no network, no clocks, no keys.
//   * EXPLAINABLE + AUDITABLE — every transition/review/retraction carries its
//     reason; every report carries limitations + provenance.
//
// __examples__
//   import { publishingDemo } from '@hsi/publishing-engine';
//   const out = publishingDemo();
//   console.log(out.published.state); // 'PUBLISHED'
// =============================================================================

export * from './types';
export * from './states';
export * from './governance';
export * from './retraction';
export * from './report';
export * from './fixtures';
