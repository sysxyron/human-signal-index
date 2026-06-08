// =============================================================================
// cache/types.ts — retrieval cache interface (WorldForge Phase 5).
//
// The engine defines the CacheStore contract + a memory implementation + key
// hashing. The Supabase-backed store lives in the APP (it needs supabase); the
// engine stays dependency-free. All time is injected via `now` (ISO string).
// =============================================================================

/** A single cached entry. `value` is the (provider-merged) search payload. */
export interface CachedEntry {
  /** The cache key (see cacheKey/hashQuery). */
  key: string;
  /** Optional provider name this entry was cached for. */
  provider?: string;
  /** Optional original query text (for diagnostics / debugging). */
  queryText?: string;
  /** The cached value (typed `unknown` — never `any` in the public API). */
  value: unknown;
  /** ISO timestamp the entry was created. */
  createdAt: string;
  /** ISO timestamp after which the entry is considered expired. */
  expiresAt: string;
}

/**
 * A cache store. Implementations must NOT throw on a miss (return null) and
 * should degrade gracefully — the engine treats any error as a cache miss.
 */
export interface CacheStore {
  /** Return a live (non-expired) entry, or null on miss/expiry. */
  get(key: string): Promise<CachedEntry | null>;
  /** Store a value under `key` with a TTL (seconds). `now` is injected. */
  set(key: string, value: unknown, ttlSeconds: number, now: string): Promise<void>;
}
