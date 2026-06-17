// =============================================================================
// HSI Phase 43 — minimal in-memory fixed-window rate limiter (PURE, no I/O).
//
// The codebase has no shared rate-limit utility and no Redis. This is a small,
// dependency-free, per-process fixed-window limiter used to protect the public
// read-only API (`/api/public/intelligence`). It is best-effort: limits are
// per-server-instance (not global across a serverless fleet), which is an
// acceptable abuse-dampener for an anonymous, cached, read-only endpoint. It
// never throws and degrades open if anything is off.
// =============================================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const STORE = new Map<string, Bucket>();

/**
 * Fixed-window check. `now` is injectable for tests. Returns whether the request
 * is allowed plus remaining quota in the current window.
 */
export function rateLimit(
  key: string,
  opts: { limit?: number; windowMs?: number; now?: number } = {},
): RateLimitResult {
  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now();

  let bucket = STORE.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    STORE.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  return { allowed, remaining, limit, resetAt: bucket.resetAt };
}

/** Best-effort eviction of expired buckets (call opportunistically). */
export function pruneRateLimit(now: number = Date.now()): void {
  for (const [k, b] of STORE) if (now >= b.resetAt) STORE.delete(k);
}

/** Test helper: clear all state. */
export function __resetRateLimit(): void {
  STORE.clear();
}

/** Derive a best-effort client key from forwarded headers (proxy-aware). */
export function clientKeyFromHeaders(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'anonymous';
}
