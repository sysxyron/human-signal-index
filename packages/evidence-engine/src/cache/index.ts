// =============================================================================
// cache/index.ts — retrieval cache barrel (Phase 5).
// =============================================================================

export type { CacheStore, CachedEntry } from './types';
export { InMemoryCacheStore } from './memory';
export { cacheKey, hashQuery } from './key';
