// =============================================================================
// @hsi/security — rate limiting
// A RateLimiter interface plus a dependency-free in-memory token bucket.
// In production behind multiple instances, back this with Redis/Upstash by
// implementing the same RateLimiter interface.
// =============================================================================

export interface RateLimitResult {
  allowed: boolean;
  /** Tokens remaining after this request. */
  remaining: number;
  /** Epoch ms when the bucket is expected to refill to capacity. */
  resetAt: number;
}

export interface RateLimiter {
  /** Consume `cost` tokens for `key`. `now` is injected for testability. */
  consume(key: string, cost?: number, now?: number): RateLimitResult;
}

export interface TokenBucketOptions {
  /** Max tokens in a bucket. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Simple in-memory token-bucket rate limiter. Suitable for single-instance
 * workers / dev. Not shared across processes — see note above for production.
 */
export class InMemoryTokenBucket implements RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly opts: TokenBucketOptions) {}

  consume(key: string, cost = 1, now: number = Date.now()): RateLimitResult {
    const { capacity, refillPerSecond } = this.opts;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    // Refill based on elapsed time.
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSecond);
    bucket.lastRefill = now;

    const allowed = bucket.tokens >= cost;
    if (allowed) bucket.tokens -= cost;

    const deficit = capacity - bucket.tokens;
    const resetAt = now + (deficit / refillPerSecond) * 1000;
    return { allowed, remaining: Math.floor(bucket.tokens), resetAt };
  }

  /** Drop a key's bucket (e.g. on successful auth). */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}
