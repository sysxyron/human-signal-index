// =============================================================================
// @hsi/source-connectors — public API
// ETHICAL, PUBLIC-ONLY connectors for the Human Signal Index. Every connector
// enforces assertPublicCapturePolicy() and respects robots.txt. Never bypasses
// logins, never captures private communities, never targets private people.
// Outputs a normalized CapturedSource with a content hash + capture timestamp.
//
// __examples__
//   import { captureRssFeed, getConnector } from '@hsi/source-connectors';
//   const cap = await captureRssFeed('https://example.org/feed.xml', { capturedAt: new Date().toISOString() });
//   cap.hashDigest; cap.metadata?.itemCount;
//   const page = await getConnector('public_page').capture('https://example.org/post', ts);
// =============================================================================

export * from './types';
export * from './policy';
export * from './hash';
export * from './url';
export * from './rssConnector';
export * from './publicPageConnector';
export * from './registry';
