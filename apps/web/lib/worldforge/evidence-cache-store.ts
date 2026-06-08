// =============================================================================
// WorldForge Phase 5 — Supabase-backed retrieval CacheStore.
//
// SERVER-ONLY — never import from a 'use client' module. Adapts the pure
// '@hsi/evidence-engine' CacheStore contract onto the `evidence_cache` table
// (migration 0009). The engine builds keys via cacheKey(mode, query.text) → a
// `${provider}:${hash}` string, calls get(key) / set(key, value, ttl, now), and
// treats ANY thrown error as a cache miss. This adapter therefore NEVER throws:
// every failure (no Supabase env, RLS denial, network) degrades to a clean miss
// / no-op so an `next build` with empty env still passes and live runs without a
// cache simply re-query providers.
//
// KEY MODEL: the engine key is `${provider}:${hash}` (see cache/key.ts). We store
// the FULL key in evidence_cache.query_hash (unique per provider) so get(key) is
// a single `eq('query_hash', key)` lookup, and split the leading provider segment
// into evidence_cache.provider for diagnostics + the unique(provider,query_hash).
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CacheStore, CachedEntry } from '@hsi/evidence-engine';
import { DEFAULT_NOW } from '@hsi/evidence-engine';

/** Split an engine cache key (`provider:hash`) into its provider namespace. */
function providerFromKey(key: string): string {
  const idx = key.indexOf(':');
  return idx > 0 ? key.slice(0, idx) : 'unknown';
}

/** Add `ttlSeconds` to an ISO `now`, returning an ISO expiry. Falls back safely. */
function expiryFrom(now: string, ttlSeconds: number): string {
  const base = Date.parse(now);
  const ms = Number.isFinite(base) ? base : Date.parse(DEFAULT_NOW);
  const ttlMs = Math.max(0, Math.floor(ttlSeconds)) * 1000;
  return new Date(ms + ttlMs).toISOString();
}

/**
 * Create a Supabase-backed {@link CacheStore}. Reads/writes the `evidence_cache`
 * table through the supplied (per-request, RLS-enforced) client. All operations
 * are best-effort and NEVER throw — failures degrade to a cache miss / no-op.
 *
 * @param client a cookie-backed Supabase client (RLS authorizes the writes).
 * @param now    optional ISO clock for deterministic expiry math (tests).
 */
export function createSupabaseCacheStore(
  client: SupabaseClient,
  now: string = DEFAULT_NOW,
): CacheStore {
  return {
    async get(key: string): Promise<CachedEntry | null> {
      try {
        const nowIso = now;
        const { data, error } = await client
          .from('evidence_cache')
          .select('provider, query_hash, query_text, response_json, created_at, expires_at')
          .eq('query_hash', key)
          .gt('expires_at', nowIso)
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        return {
          key,
          provider: (data.provider as string | null) ?? undefined,
          queryText: (data.query_text as string | null) ?? undefined,
          value: data.response_json as unknown,
          createdAt: (data.created_at as string | null) ?? nowIso,
          expiresAt: (data.expires_at as string | null) ?? nowIso,
        };
      } catch {
        // Any failure (no env, RLS, parse) → treat as a miss.
        return null;
      }
    },

    async set(
      key: string,
      value: unknown,
      ttlSeconds: number,
      setNow: string = now,
    ): Promise<void> {
      try {
        const createdAt = setNow;
        const expiresAt = expiryFrom(setNow, ttlSeconds);
        // Derive a best-effort query_text from the cached payload if present;
        // otherwise leave null. The provider namespace comes from the key prefix.
        await client.from('evidence_cache').upsert(
          {
            provider: providerFromKey(key),
            query_hash: key,
            query_text: null,
            response_json: value as Record<string, unknown> | unknown[] | null,
            created_at: createdAt,
            expires_at: expiresAt,
          },
          { onConflict: 'provider,query_hash' },
        );
      } catch {
        // Best-effort store; ignore all failures (cache is an optimization).
      }
    },
  };
}
