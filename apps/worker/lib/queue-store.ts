// =============================================================================
// apps/worker/lib/queue-store.ts — service-role QueueStore for the worker.
//
// The pure @hsi/scheduler package defines the QueueStore / DedupeStore PORTS and
// ships in-memory implementations for tests/offline. This module provides the
// DB-backed ADAPTERS the worker uses in production, against the Phase-8 tables
//   * hsin_job_queue     (the durable queue)
//   * hsin_job_attempts  (append-only per-attempt log)
//   * hsin_capture_dedupes (idempotent capture bookkeeping)
// via the service-role Supabase client (BYPASSES RLS — server-only, per 0012).
//
// OFFLINE-SAFE (binding): if the service-role env is NOT configured (or the
// client cannot be created), the factories return the in-memory stores so the
// worker runs fully offline with NO database and NO network. Construction NEVER
// throws — a missing/invalid client degrades to in-memory, logged once.
//
// This file is intentionally self-contained: it does not import the engine's
// internal SQL helpers, only the public QueueStore/DedupeStore contracts.
// =============================================================================

import {
  InMemoryQueueStore,
  InMemoryDedupeStore,
  decideAfterFailure,
  type QueueStore,
  type DedupeStore,
  type DedupeRecord,
  type EnqueueInput,
  type Job,
  type JobAttempt,
  type JobStatus,
  type RetryPolicy,
} from '@hsi/scheduler';
import { createServiceRoleClient } from '@hsi/database';
import { logger } from '../src/logger';

/** Minimal structural shape of the bits of the Supabase client we use. */
interface SupabaseLike {
  from(table: string): {
    insert: (values: unknown) => {
      select: (cols?: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
    select: (cols?: string) => SelectBuilder;
    update: (values: unknown) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}

interface SelectBuilder {
  eq: (col: string, val: unknown) => SelectBuilder;
  in: (col: string, vals: unknown[]) => SelectBuilder;
  lte: (col: string, val: unknown) => SelectBuilder;
  order: (col: string, opts: { ascending: boolean }) => SelectBuilder;
  limit: (n: number) => SelectBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  // Awaitable list result.
  then: (
    onfulfilled: (v: { data: unknown; error: unknown }) => unknown,
  ) => Promise<unknown>;
}

// ---- DB row shapes (mirror migration 0012 columns) --------------------------

interface JobRow {
  id: string;
  job_type: string;
  status: JobStatus;
  priority: number;
  source_id: string | null;
  payload_json: Record<string, unknown> | null;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    jobType: r.job_type,
    status: r.status,
    priority: r.priority,
    sourceId: r.source_id ?? undefined,
    payload: r.payload_json ?? undefined,
    scheduledFor: r.scheduled_for,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    errorMessage: r.error_message ?? undefined,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// =============================================================================
// Supabase-backed QueueStore.
// =============================================================================

class SupabaseQueueStore implements QueueStore {
  constructor(private readonly db: SupabaseLike) {}

  async enqueue(input: EnqueueInput, now: string): Promise<Job> {
    const { data, error } = await this.db
      .from('hsin_job_queue')
      .insert({
        job_type: input.jobType,
        status: 'queued',
        priority: input.priority ?? 5,
        source_id: input.sourceId ?? null,
        payload_json: input.payload ?? null,
        scheduled_for: input.scheduledFor ?? now,
        attempt_count: 0,
        max_attempts: input.maxAttempts ?? 3,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new Error(`enqueue failed: ${describeError(error)}`);
    }
    return rowToJob(data as JobRow);
  }

  /**
   * Claim due jobs. NOTE: this issues a select + per-row conditional update,
   * which is NOT atomic across concurrent workers. For multi-worker production
   * deployments, back this with a single `UPDATE ... FOR UPDATE SKIP LOCKED`
   * statement (e.g. an RPC) — see docs/architecture/scheduler-queue.md. For a
   * single drainer (the default Vercel-cron topology) this is sufficient.
   */
  async claimNext(opts: {
    now: string;
    jobTypes?: string[];
    limit?: number;
  }): Promise<Job[]> {
    const limit = opts.limit ?? 1;
    let q = this.db
      .from('hsin_job_queue')
      .select('*')
      .in('status', ['queued', 'retrying'])
      .lte('scheduled_for', opts.now);
    if (opts.jobTypes && opts.jobTypes.length > 0) {
      q = q.in('job_type', opts.jobTypes);
    }
    q = q
      .order('priority', { ascending: false })
      .order('scheduled_for', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(limit);

    const { data, error } = (await q) as { data: JobRow[] | null; error: unknown };
    if (error || !data) return [];

    const claimed: Job[] = [];
    for (const row of data) {
      const { error: updErr } = await this.db
        .from('hsin_job_queue')
        .update({
          status: 'running',
          started_at: opts.now,
          attempt_count: row.attempt_count + 1,
          updated_at: opts.now,
        })
        .eq('id', row.id);
      if (updErr) {
        logger.warn('queueStore.claim.updateFailed', {
          jobId: row.id,
          error: describeError(updErr),
        });
        continue;
      }
      claimed.push(
        rowToJob({
          ...row,
          status: 'running',
          started_at: opts.now,
          attempt_count: row.attempt_count + 1,
          updated_at: opts.now,
        }),
      );
    }
    return claimed;
  }

  async markCompleted(
    jobId: string,
    now: string,
    _log?: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.db
      .from('hsin_job_queue')
      .update({
        status: 'completed',
        finished_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq('id', jobId);
    if (error) {
      logger.warn('queueStore.markCompleted.failed', {
        jobId,
        error: describeError(error),
      });
    }
  }

  async markFailedOrRetry(
    jobId: string,
    now: string,
    error: string,
    policy: RetryPolicy,
  ): Promise<{ retried: boolean; nextRunAt?: string }> {
    const job = await this.get(jobId);
    if (!job) return { retried: false };

    const decision = decideAfterFailure(job, policy, now);
    if (decision.status === 'retrying' && decision.nextRunAt) {
      const { error: updErr } = await this.db
        .from('hsin_job_queue')
        .update({
          status: 'retrying',
          scheduled_for: decision.nextRunAt,
          started_at: null,
          error_message: error,
          updated_at: now,
        })
        .eq('id', jobId);
      if (updErr) {
        logger.warn('queueStore.markFailedOrRetry.updateFailed', {
          jobId,
          error: describeError(updErr),
        });
      }
      return { retried: true, nextRunAt: decision.nextRunAt };
    }

    const { error: updErr } = await this.db
      .from('hsin_job_queue')
      .update({
        status: 'failed',
        finished_at: now,
        error_message: error,
        updated_at: now,
      })
      .eq('id', jobId);
    if (updErr) {
      logger.warn('queueStore.markFailedOrRetry.failFailed', {
        jobId,
        error: describeError(updErr),
      });
    }
    return { retried: false };
  }

  async recordAttempt(attempt: JobAttempt): Promise<void> {
    const { error } = await this.db
      .from('hsin_job_attempts')
      .insert({
        job_id: attempt.jobId,
        attempt_number: attempt.attemptNumber,
        started_at: attempt.startedAt,
        finished_at: attempt.finishedAt ?? null,
        status: attempt.status,
        error_message: attempt.errorMessage ?? null,
        log_json: attempt.log ?? null,
      })
      .select('id')
      .single();
    if (error) {
      logger.warn('queueStore.recordAttempt.failed', {
        jobId: attempt.jobId,
        error: describeError(error),
      });
    }
  }

  async cancel(jobId: string, now: string): Promise<void> {
    const { error } = await this.db
      .from('hsin_job_queue')
      .update({ status: 'cancelled', finished_at: now, updated_at: now })
      .eq('id', jobId);
    if (error) {
      logger.warn('queueStore.cancel.failed', {
        jobId,
        error: describeError(error),
      });
    }
  }

  async get(jobId: string): Promise<Job | null> {
    const { data, error } = await this.db
      .from('hsin_job_queue')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    if (error || !data) return null;
    return rowToJob(data as JobRow);
  }
}

// =============================================================================
// Supabase-backed DedupeStore.
// =============================================================================

interface DedupeRow {
  content_hash: string;
  canonical_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  signal_id: string | null;
}

class SupabaseDedupeStore implements DedupeStore {
  constructor(private readonly db: SupabaseLike) {}

  async seen(key: string): Promise<DedupeRecord | null> {
    // The key is the engine's dedupeKey (sourceId|hash|url). We store the raw
    // content_hash; query by it within the source scope encoded in the key.
    const { sourceId, contentHash } = parseDedupeKey(key);
    let q = this.db
      .from('hsin_capture_dedupes')
      .select('content_hash,canonical_url,first_seen_at,last_seen_at,signal_id')
      .eq('content_hash', contentHash);
    if (sourceId) q = q.eq('source_id', sourceId);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error || !data) return null;
    const row = data as DedupeRow;
    return {
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      signalId: row.signal_id ?? undefined,
    };
  }

  async remember(key: string, now: string, signalId?: string): Promise<void> {
    const { sourceId, contentHash, canonicalUrl } = parseDedupeKey(key);
    const existing = await this.seen(key);
    if (existing) {
      const { error } = await this.db
        .from('hsin_capture_dedupes')
        .update({ last_seen_at: now, signal_id: signalId ?? null })
        .eq('content_hash', contentHash);
      if (error) {
        logger.warn('dedupeStore.remember.updateFailed', {
          error: describeError(error),
        });
      }
      return;
    }
    const { error } = await this.db
      .from('hsin_capture_dedupes')
      .insert({
        source_id: sourceId ?? null,
        content_hash: contentHash,
        canonical_url: canonicalUrl ?? null,
        first_seen_at: now,
        last_seen_at: now,
        signal_id: signalId ?? null,
      })
      .select('id')
      .single();
    if (error) {
      logger.warn('dedupeStore.remember.insertFailed', {
        error: describeError(error),
      });
    }
  }
}

// =============================================================================
// Factories — service-role when configured, else in-memory (offline-safe).
// =============================================================================

/**
 * Resolve a service-role Supabase client, or null when env is not configured /
 * the client cannot be created. NEVER throws.
 */
function tryServiceRoleClient(): SupabaseLike | null {
  // Guard on env first: createServiceRoleClient THROWS when env is missing, so
  // this keeps the offline path free of any exception.
  if (!serviceRoleConfigured()) return null;
  try {
    return createServiceRoleClient() as unknown as SupabaseLike;
  } catch (e) {
    logger.warn('queueStore.serviceRole.unavailable', {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** True when the service-role env is present. */
export function serviceRoleConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Build the worker's {@link QueueStore}. Returns a Supabase-backed store when
 * the service-role env is configured; otherwise an {@link InMemoryQueueStore}
 * so the worker runs fully offline. NEVER throws.
 */
export function createWorkerQueueStore(): QueueStore {
  const client = tryServiceRoleClient();
  if (client) {
    logger.info('queueStore.mode', { mode: 'supabase' });
    return new SupabaseQueueStore(client);
  }
  logger.info('queueStore.mode', { mode: 'in-memory (offline)' });
  return new InMemoryQueueStore();
}

/**
 * Build the worker's {@link DedupeStore}. Supabase-backed when configured, else
 * in-memory. NEVER throws.
 */
export function createWorkerDedupeStore(): DedupeStore {
  const client = tryServiceRoleClient();
  if (client) return new SupabaseDedupeStore(client);
  return new InMemoryDedupeStore();
}

// ---- helpers ----------------------------------------------------------------

/**
 * Parse the engine's `dedupeKey` — `sourceId::contentHash::canonicalUrl` where a
 * missing url is encoded as `-` (see @hsi/scheduler dedupe.dedupeKey).
 */
function parseDedupeKey(key: string): {
  sourceId?: string;
  contentHash: string;
  canonicalUrl?: string;
} {
  const parts = key.split('::');
  if (parts.length >= 2) {
    const url = parts[2];
    return {
      sourceId: parts[0] || undefined,
      contentHash: parts[1],
      canonicalUrl: url && url !== '-' ? url : undefined,
    };
  }
  // Fallback: treat the whole key as the hash.
  return { contentHash: key };
}

function describeError(error: unknown): string {
  if (!error) return 'unknown';
  if (typeof error === 'string') return error;
  const e = error as { message?: string; code?: string };
  return e.message ?? e.code ?? JSON.stringify(error);
}
