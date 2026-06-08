// =============================================================================
// HSIN Phase 8/9 — Supabase-backed ScalableQueueStore + DedupeStore (SERVER-ONLY).
//
// Adapts the PURE '@hsi/scheduler' ports (QueueStore / ScalableQueueStore /
// DedupeStore) onto the Phase-8/9 persistence (migrations 0012 + 0013):
// hsin_job_queue (+ locked_until/dead_lettered_at), hsin_job_attempts,
// hsin_dead_letter_jobs, and hsin_capture_dedupes. The scheduler engine is
// DB-agnostic; this module is the single place those ports talk to Supabase.
//
// CLIENT: these stores take a SupabaseClient so the caller controls auth. App
// actions pass the cookie-backed, RLS-enforced client. The RPC `claim_hsin_jobs`
// is SECURITY DEFINER + granted to authenticated, so a reviewer+ caller can claim
// without service_role. The worker passes a service-role client (bypasses RLS).
// NEVER inject service_role into app actions.
//
// ATOMICITY (Phase 9): `claimBatch` calls the Postgres `claim_hsin_jobs` RPC,
// which does a single atomic `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP
// LOCKED)`. N concurrent workers each grab a disjoint batch without double-claim.
// `claimNext` is a thin wrapper over `claimBatch({ limit: 1 })` for back-compat.
//
// DEAD-LETTER (Phase 9): when `markFailedOrRetry` decides a terminal failure with
// exhausted attempts (shouldDeadLetter), we `deadLetter()` — insert a
// hsin_dead_letter_jobs snapshot AND mark the queue row failed/dead_lettered_at.
// `requeueDeadLetter` re-creates a fresh queued job from a DLQ snapshot.
//
// HONESTY/SAFETY: every method NEVER throws — failures degrade to a safe value
// (empty array / no-op / null) so a queue hiccup can't crash a request.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  decideAfterFailure,
  DEFAULT_RETRY_POLICY,
  shouldDeadLetter,
  toDeadLetterEntry,
  VISIBILITY_DEFAULT_SECONDS,
  lockedUntil as computeLockedUntil,
  type DedupeRecord,
  type DedupeStore,
  type EnqueueInput,
  type FailureOutcome,
  type Job,
  type JobAttempt,
  type RetryPolicy,
  type ScalableQueueStore,
} from '@hsi/scheduler';
import type {
  HsinJobAttemptRecord,
  HsinJobQueueRecord,
} from '@hsi/shared-types';

// -----------------------------------------------------------------------------
// Row <-> engine Job mapping. The DB row (HsinJobQueueRecord) uses snake_case
// columns; the engine Job is camelCase. payload_json/log_json are typed jsonb.
// -----------------------------------------------------------------------------
type JsonRecord = Record<string, unknown>;

/** A job-queue row with the Phase-9 visibility/dead-letter columns. */
type JobQueueRowP9 = HsinJobQueueRecord & {
  locked_until?: string | null;
  dead_lettered_at?: string | null;
};

function rowToJob(row: JobQueueRowP9): Job {
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    priority: row.priority,
    sourceId: row.source_id ?? undefined,
    payload: row.payload_json ?? undefined,
    scheduledFor: row.scheduled_for,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    lockedUntil: row.locked_until ?? undefined,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// ScalableQueueStore (Phase 9) — hsin_job_queue (+ locked_until/dead_lettered_at),
// hsin_job_attempts, hsin_dead_letter_jobs.
//
// The returned store also exposes `requeueDeadLetter` (beyond the engine port) so
// the curator+ requeue action can re-drive a parked job.
// =============================================================================
export interface SupabaseQueueStore extends ScalableQueueStore {
  /**
   * Re-create a fresh `queued` job from a parked dead-letter snapshot and stamp
   * the DLQ row's `requeued_at`. Returns the new Job, or null on failure / when
   * the snapshot is missing. NEVER throws.
   */
  requeueDeadLetter(deadLetterId: string, now?: string): Promise<Job | null>;
}

export function createSupabaseQueueStore(
  client: SupabaseClient,
): SupabaseQueueStore {
  return {
    /** Insert a new job (status 'queued'). Returns the persisted Job. */
    async enqueue(input: EnqueueInput, now: string): Promise<Job> {
      const insert: JsonRecord = {
        job_type: input.jobType,
        status: 'queued',
        priority: input.priority ?? 5,
        source_id: input.sourceId ?? null,
        payload_json: input.payload ?? null,
        scheduled_for: input.scheduledFor ?? now,
        attempt_count: 0,
        max_attempts: input.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
      };
      const { data, error } = await client
        .from('hsin_job_queue')
        .insert(insert)
        .select('*')
        .single();
      if (error || !data) {
        // Synthesize a transient Job so the caller still gets a value; it is not
        // persisted (the insert failed). NEVER throw.
        return {
          id: '',
          jobType: input.jobType,
          status: 'queued',
          priority: input.priority ?? 5,
          sourceId: input.sourceId,
          payload: input.payload,
          scheduledFor: input.scheduledFor ?? now,
          attemptCount: 0,
          maxAttempts: input.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
          createdAt: now,
          updatedAt: now,
        };
      }
      return rowToJob(data as HsinJobQueueRecord);
    },

    /**
     * Phase-9 atomic, visibility-aware claim. Delegates to the Postgres
     * `claim_hsin_jobs` RPC (SECURITY DEFINER, FOR UPDATE SKIP LOCKED): it
     * selects due queued/retrying jobs AND reclaims running jobs whose
     * visibility lease expired, flips them to 'running', stamps started_at,
     * extends locked_until by p_visibility_seconds, and bumps attempt_count.
     * Returns the claimed rows mapped to engine Jobs. `jobTypes` is applied
     * client-side after the atomic claim (the RPC claims by priority/age only).
     * NEVER throws.
     */
    async claimBatch(opts: {
      now: string;
      limit: number;
      visibilitySeconds?: number;
      jobTypes?: string[];
    }): Promise<Job[]> {
      try {
        const visibility = opts.visibilitySeconds ?? VISIBILITY_DEFAULT_SECONDS;
        const { data, error } = await client.rpc('claim_hsin_jobs', {
          p_limit: opts.limit,
          p_visibility_seconds: visibility,
        });
        if (error || !data) return [];

        let jobs = (data as JobQueueRowP9[]).map(rowToJob);
        if (opts.jobTypes && opts.jobTypes.length > 0) {
          const types = new Set(opts.jobTypes);
          jobs = jobs.filter((j) => types.has(j.jobType));
        }
        // Preserve the RPC's deterministic order (priority desc, scheduled asc,
        // created asc) — supabase-js may not guarantee row order across the RPC.
        jobs.sort(
          (a, b) =>
            b.priority - a.priority ||
            a.scheduledFor.localeCompare(b.scheduledFor) ||
            a.createdAt.localeCompare(b.createdAt),
        );
        return jobs;
      } catch {
        return [];
      }
    },

    /**
     * Back-compat single claim — a thin wrapper over claimBatch(limit:1). The
     * atomic RPC replaces the Phase-8 select-then-guarded-update claim.
     */
    async claimNext(opts: {
      now: string;
      jobTypes?: string[];
      limit?: number;
    }): Promise<Job[]> {
      return this.claimBatch({
        now: opts.now,
        limit: opts.limit ?? 1,
        jobTypes: opts.jobTypes,
      });
    },

    /**
     * Phase-9 visibility heartbeat: extend a running job's lease so long work is
     * not reclaimed mid-flight. No-op on a non-running job. NEVER throws.
     */
    async heartbeat(
      jobId: string,
      now: string,
      visibilitySeconds?: number,
    ): Promise<void> {
      try {
        const secs = visibilitySeconds ?? VISIBILITY_DEFAULT_SECONDS;
        await client
          .from('hsin_job_queue')
          .update({ locked_until: computeLockedUntil(now, secs) })
          .eq('id', jobId)
          .eq('status', 'running');
      } catch {
        // never throw
      }
    },

    /**
     * Phase-9 dead-letter: force a job terminal (status='failed',
     * dead_lettered_at=now, clear the lease) AND insert a hsin_dead_letter_jobs
     * snapshot for inspection/requeue. Best-effort per write; NEVER throws.
     */
    async deadLetter(jobId: string, now: string, reason: string): Promise<void> {
      try {
        const job = await this.get(jobId);
        // Snapshot the job into the DLQ before marking it terminal.
        if (job) {
          const entry = toDeadLetterEntry(job, now, reason);
          await client
            .from('hsin_dead_letter_jobs')
            .insert({
              job_id: entry.jobId,
              job_type: entry.jobType,
              source_id: entry.sourceId ?? null,
              payload_json: entry.payload ?? null,
              attempt_count: entry.attemptCount,
              max_attempts: entry.maxAttempts,
              reason: entry.reason,
              last_error: entry.lastError ?? null,
              dead_lettered_at: entry.deadLetteredAt,
            })
            .then(() => undefined, () => undefined);
        }
        await client
          .from('hsin_job_queue')
          .update({
            status: 'failed',
            finished_at: now,
            dead_lettered_at: now,
            locked_until: null,
            ...(reason ? { error_message: reason } : {}),
          })
          .eq('id', jobId);
      } catch {
        // never throw
      }
    },

    /**
     * Re-create a fresh `queued` job from a parked dead-letter snapshot (curator+
     * path via the action). Loads the DLQ row, enqueues a clean job (attempt_count
     * reset to 0), and stamps requeued_at. Returns the new Job or null. NEVER throws.
     */
    async requeueDeadLetter(
      deadLetterId: string,
      now: string = new Date().toISOString(),
    ): Promise<Job | null> {
      try {
        const { data: dlq, error } = await client
          .from('hsin_dead_letter_jobs')
          .select('*')
          .eq('id', deadLetterId)
          .maybeSingle();
        if (error || !dlq) return null;

        const snapshot = dlq as {
          id: string;
          job_type?: string | null;
          source_id?: string | null;
          payload_json?: JsonRecord | null;
          max_attempts?: number | null;
        };

        const input: EnqueueInput = {
          jobType: snapshot.job_type ?? 'capture',
          maxAttempts: snapshot.max_attempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
        };
        if (snapshot.source_id) input.sourceId = snapshot.source_id;
        if (snapshot.payload_json) input.payload = snapshot.payload_json;

        const job = await this.enqueue(input, now);
        if (!job.id) return null;

        await client
          .from('hsin_dead_letter_jobs')
          .update({ requeued_at: now })
          .eq('id', deadLetterId)
          .then(() => undefined, () => undefined);

        return job;
      } catch {
        return null;
      }
    },

    /** Mark a job completed (+ optional attempt-log merge is the caller's job). */
    async markCompleted(
      jobId: string,
      now: string,
      _log?: Record<string, unknown>,
    ): Promise<void> {
      try {
        await client
          .from('hsin_job_queue')
          .update({ status: 'completed', finished_at: now })
          .eq('id', jobId);
      } catch {
        // never throw
      }
    },

    /**
     * Decide retry vs terminal-fail via the engine, then persist:
     *   * on retry → status='retrying', scheduled_for=nextRunAt, clear the lease;
     *   * on terminal exhausted (shouldDeadLetter) → deadLetter() (DLQ snapshot +
     *     status='failed', dead_lettered_at) and return { retried:false,
     *     deadLettered:true };
     *   * on terminal not-exhausted → status='failed'.
     *
     * Phase-9 note: the `claim_hsin_jobs` RPC ALREADY bumped attempt_count on
     * claim, so the stored count reflects THIS attempt; we do NOT bump it again.
     * NEVER throws.
     */
    async markFailedOrRetry(
      jobId: string,
      now: string,
      error: string,
      policy: RetryPolicy,
    ): Promise<FailureOutcome> {
      try {
        const { data: row } = await client
          .from('hsin_job_queue')
          .select('attempt_count, max_attempts')
          .eq('id', jobId)
          .maybeSingle();
        // attempt_count already reflects attempts made (bumped on claim by the RPC).
        const attemptCount = (row?.attempt_count as number | undefined) ?? 1;
        const maxAttempts =
          (row?.max_attempts as number | undefined) ?? policy.maxAttempts;

        const decision = decideAfterFailure(
          { attemptCount, maxAttempts },
          policy,
          now,
        );

        if (decision.status === 'retrying' && decision.nextRunAt) {
          await client
            .from('hsin_job_queue')
            .update({
              status: 'retrying',
              scheduled_for: decision.nextRunAt,
              error_message: error,
              started_at: null,
              locked_until: null,
            })
            .eq('id', jobId);
          return { retried: true, nextRunAt: decision.nextRunAt };
        }

        // Terminal. When attempts are exhausted, dead-letter (snapshot + mark).
        if (shouldDeadLetter({ attemptCount, maxAttempts }, policy)) {
          const reason = `max attempts (${attemptCount}/${Math.min(
            maxAttempts,
            policy.maxAttempts,
          )}) exhausted: ${error}`;
          await this.deadLetter(jobId, now, reason);
          return { retried: false, deadLettered: true };
        }

        await client
          .from('hsin_job_queue')
          .update({
            status: 'failed',
            finished_at: now,
            error_message: error,
            locked_until: null,
          })
          .eq('id', jobId);
        return { retried: false };
      } catch {
        return { retried: false };
      }
    },

    /** Append a per-attempt execution-log row. */
    async recordAttempt(attempt: JobAttempt): Promise<void> {
      try {
        const insert: JsonRecord = {
          job_id: attempt.jobId,
          attempt_number: attempt.attemptNumber,
          started_at: attempt.startedAt ?? null,
          finished_at: attempt.finishedAt ?? null,
          status: attempt.status ?? null,
          error_message: attempt.errorMessage ?? null,
          log_json: attempt.log ?? null,
        };
        await client.from('hsin_job_attempts').insert(insert);
      } catch {
        // never throw
      }
    },

    /** Cancel a job (status 'cancelled', finished_at). */
    async cancel(jobId: string, now: string): Promise<void> {
      try {
        await client
          .from('hsin_job_queue')
          .update({ status: 'cancelled', finished_at: now })
          .eq('id', jobId);
      } catch {
        // never throw
      }
    },

    /** Load one job (or null). */
    async get(jobId: string): Promise<Job | null> {
      try {
        const { data, error } = await client
          .from('hsin_job_queue')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();
        if (error || !data) return null;
        return rowToJob(data as HsinJobQueueRecord);
      } catch {
        return null;
      }
    },
  };
}

// =============================================================================
// DedupeStore — hsin_capture_dedupes.
//
// dedupeKey() encodes `${sourceId}::${contentHash}::${url}`; we split it back to
// the row's columns (source_id, content_hash, canonical_url) so the unique
// (source_id, content_hash) constraint can do its job. `seen` reads the row;
// `remember` upserts it (insert, or update last_seen_at/signal_id on conflict).
// =============================================================================

interface ParsedKey {
  sourceId: string;
  contentHash: string;
  canonicalUrl?: string;
}

/** Parse the engine dedupeKey back into row columns. */
function parseKey(key: string): ParsedKey {
  const [sourceId = '', contentHash = '', url = '-'] = key.split('::');
  return {
    sourceId,
    contentHash,
    canonicalUrl: url && url !== '-' ? url : undefined,
  };
}

export function createSupabaseDedupeStore(
  client: SupabaseClient,
): DedupeStore {
  return {
    /** Return the existing dedupe record for a key, or null. */
    async seen(key: string): Promise<DedupeRecord | null> {
      try {
        const { sourceId, contentHash } = parseKey(key);
        const { data } = await client
          .from('hsin_capture_dedupes')
          .select('first_seen_at, last_seen_at, signal_id')
          .eq('source_id', sourceId)
          .eq('content_hash', contentHash)
          .maybeSingle();
        if (!data) return null;
        return {
          firstSeenAt:
            (data.first_seen_at as string | undefined) ?? new Date(0).toISOString(),
          lastSeenAt:
            (data.last_seen_at as string | undefined) ?? new Date(0).toISOString(),
          signalId: (data.signal_id as string | undefined) ?? undefined,
        };
      } catch {
        return null;
      }
    },

    /** Insert or update the dedupe record (last_seen_at/signal_id). */
    async remember(
      key: string,
      now: string,
      signalId?: string,
    ): Promise<void> {
      try {
        const { sourceId, contentHash, canonicalUrl } = parseKey(key);
        // Update first; if nothing matched, insert (avoids needing onConflict
        // ignore semantics through supabase-js for the unique constraint).
        const { data: updated } = await client
          .from('hsin_capture_dedupes')
          .update({
            last_seen_at: now,
            ...(signalId ? { signal_id: signalId } : {}),
          })
          .eq('source_id', sourceId)
          .eq('content_hash', contentHash)
          .select('id');
        if (updated && updated.length > 0) return;

        await client.from('hsin_capture_dedupes').insert({
          source_id: sourceId,
          content_hash: contentHash,
          canonical_url: canonicalUrl ?? null,
          first_seen_at: now,
          last_seen_at: now,
          signal_id: signalId ?? null,
        });
      } catch {
        // never throw
      }
    },
  };
}

/** Re-export for convenience: callers may want the engine attempt-record shape. */
export type { HsinJobAttemptRecord };
