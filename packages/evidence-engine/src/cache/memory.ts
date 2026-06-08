// =============================================================================
// cache/memory.ts — in-memory CacheStore with TTL eviction (Phase 5).
//
// Time is INJECTED via `now` (ISO string) on both get and set so behaviour is
// deterministic in tests. Expired entries are lazily evicted on read.
// =============================================================================

import type { CacheStore, CachedEntry } from './types';
import { DEFAULT_NOW } from '../normalize';

/** An in-memory CacheStore. Suitable for a single process / a test. */
export class InMemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, CachedEntry>();

  /**
   * Read a live entry. `now` defaults to DEFAULT_NOW; pass a real/fixed value to
   * drive TTL expiry deterministically. Returns null on miss or expiry.
   */
  async get(key: string, now: string = DEFAULT_NOW): Promise<CachedEntry | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.parse(entry.expiresAt) <= Date.parse(now)) {
      this.map.delete(key); // lazy eviction
      return null;
    }
    return entry;
  }

  /** Store `value` under `key` with a TTL (seconds), stamped at `now`. */
  async set(
    key: string,
    value: unknown,
    ttlSeconds: number,
    now: string = DEFAULT_NOW,
  ): Promise<void> {
    const createdMs = Date.parse(now);
    const expiresAt = new Date(createdMs + ttlSeconds * 1000).toISOString();
    this.map.set(key, { key, value, createdAt: now, expiresAt });
  }

  /** Number of (possibly-expired) entries currently held. */
  get size(): number {
    return this.map.size;
  }

  /** Clear all entries. */
  clear(): void {
    this.map.clear();
  }
}
