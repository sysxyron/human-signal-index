/**
 * @hsi/scheduler — deduplication helpers.
 *
 * Stable, deterministic dedupe keys plus a DB-agnostic {@link DedupeStore} port
 * and an in-memory implementation for tests / offline use.
 */

/**
 * Build a stable dedupe key from a source id, a content hash, and an optional
 * canonical URL. Deterministic — same inputs always produce the same key.
 */
export function dedupeKey(
  sourceId: string,
  contentHash: string,
  canonicalUrl?: string,
): string {
  const url = canonicalUrl && canonicalUrl.trim() !== '' ? canonicalUrl.trim() : '-';
  return `${sourceId}::${contentHash}::${url}`;
}

/** A record of a previously-seen item. */
export interface DedupeRecord {
  firstSeenAt: string;
  lastSeenAt: string;
  signalId?: string;
}

/** DB-agnostic port for deduplication state. */
export interface DedupeStore {
  seen(key: string): Promise<DedupeRecord | null>;
  remember(key: string, now: string, signalId?: string): Promise<void>;
}

/** In-memory {@link DedupeStore} for tests and offline use. */
export class InMemoryDedupeStore implements DedupeStore {
  private readonly map = new Map<string, DedupeRecord>();

  async seen(key: string): Promise<DedupeRecord | null> {
    return this.map.get(key) ?? null;
  }

  async remember(key: string, now: string, signalId?: string): Promise<void> {
    const existing = this.map.get(key);
    if (existing) {
      existing.lastSeenAt = now;
      if (signalId !== undefined) existing.signalId = signalId;
      this.map.set(key, existing);
    } else {
      this.map.set(key, {
        firstSeenAt: now,
        lastSeenAt: now,
        signalId,
      });
    }
  }

  /** Test/inspection helper: number of distinct keys remembered. */
  size(): number {
    return this.map.size;
  }
}

/** Result of a duplicate check. */
export interface DuplicateResult {
  duplicate: boolean;
  firstSeenAt?: string;
  signalId?: string;
}

/**
 * Check whether `(sourceId, contentHash, canonicalUrl)` has been seen before.
 *
 * First encounter → remembers it and returns `{ duplicate: false }`.
 * Subsequent encounters → updates `lastSeenAt` and returns `duplicate: true`
 * with the original `firstSeenAt` and any associated `signalId`.
 *
 * Pure aside from the injected store and `now`.
 */
export async function isDuplicate(
  store: DedupeStore,
  sourceId: string,
  contentHash: string,
  canonicalUrl: string | undefined,
  now: string,
  signalId?: string,
): Promise<DuplicateResult> {
  const key = dedupeKey(sourceId, contentHash, canonicalUrl);
  const existing = await store.seen(key);
  if (existing) {
    await store.remember(key, now, signalId ?? existing.signalId);
    return {
      duplicate: true,
      firstSeenAt: existing.firstSeenAt,
      signalId: signalId ?? existing.signalId,
    };
  }
  await store.remember(key, now, signalId);
  return { duplicate: false, firstSeenAt: now, signalId };
}
