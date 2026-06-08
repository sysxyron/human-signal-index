// =============================================================================
// cache/key.ts — deterministic cache-key hashing (WorldForge Phase 5).
//
// Stable, dependency-free FNV-1a hashing so the same (provider, query) always
// maps to the same key across runs/processes. PURE — no randomness, no clock.
// =============================================================================

/** Normalize a query string for stable hashing (case/space-insensitive). */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * FNV-1a 32-bit hash → 8-char zero-padded hex. Deterministic for a given input.
 */
export function hashQuery(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts (avoids BigInt / overflow issues).
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to unsigned 32-bit and hex-encode.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Build a stable cache key for a (provider, query) pair. The query is
 * normalized first so trivial whitespace/case differences hit the same entry.
 */
export function cacheKey(provider: string, query: string): string {
  const normalized = normalizeQuery(query);
  return `${provider}:${hashQuery(`${provider}:${normalized}`)}`;
}
