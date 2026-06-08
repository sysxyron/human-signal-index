// =============================================================================
// HSIN Phase 8 — Supabase-backed QueueStore + DedupeStore (SERVER-ONLY).
//
// Adapts the PURE '@hsi/scheduler' ports (QueueStore / DedupeStore) onto the
// Phase-8 persistence (migration 0012): hsin_job_queue + hsin_job_attempts and
// hsin_capture_dedupes. The scheduler engine is DB-agnostic; this module is the
// single place those ports talk to Supabase.
//
// CLIENT: these stores take a SupabaseClient so the caller controls auth. App
// actions pass the cookie-backed, RLS-enforced client (operational writes there
// require curator/admin per migration 0012). The worker passes a service-role
// client (which bypasses RLS). NEVER inject service_role into app actions.
//
// ATOMICITY CAVEAT (claimNext): Postgres `FOR UPDATE SKIP LOCKED` is NOT
// reachable through supabase-js. We approximate atomic claim with a GUARDED
// UPDATE: select due ids, then `UPDATE ... WHERE id IN (...) AND status IN
// ('queued','retrying')` and trust the returned rows (only rows still in a
// claimable status are updated/returned). Two concurrent claimers can both pass
// the select but the update's status guard means each job is claimed at most
// once — at the cost of one claimer getting fewer rows than `limit`. For strict
// single-claim semantics under heavy concurrency, run claims through a single
// worker or a SECURITY DEFINER RPC. Good enough for the single-worker drain.
//
// HONESTY/SAFETY: every method NEVER throws — failures degrade to a safe value
// (empty array / no-op / null) so a queue hiccup can't crash a request.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  decideAfterFailure,
  DEFAULT_RETRY_POLICY,
  type DedupeRecord,
  type DedupeStore,
  type EnqueueInput,
  type Job,
  type JobAttempt,
  type QueueStore,
  type RetryPolicy,
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

function rowToJob(row: HsinJobQueueRecord): Job {
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
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// QueueStore — hsin_job_queue + hsin_job_attempts.
// =============================================================================
export function createSupabaseQueueStore(client: SupabaseClient): QueueStore {
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
     * Claim due jobs: select queued/retrying with scheduled_for<=now ordered by
     * priority desc then scheduled_for asc, then guard-update them to 'running'.
     */
    async claimNext(opts: {
      now: string;
      jobTypes?: string[];
      limit?: number;
    }): Promise<Job[]> {
      try {
        const limit = opts.limit ?? 1;
        let q = client
          .from('hsin_job_queue')
          .select('id')
          .in('status', ['queued', 'retrying'])
          .lte('scheduled_for', opts.now);
        if (opts.jobTypes && opts.jobTypes.length > 0) {
          q = q.in('job_type', opts.jobTypes);
        }
        const { data: candidates, error: selErr } = await q
          .order('priority', { ascending: false })
          .order('scheduled_for', { ascending: true })
          .limit(limit);
        if (selErr || !candidates || candidates.length === 0) return [];

        const ids = (candidates as Array<{ id: string }>).map((r) => r.id);

        // Guarded UPDATE → 'running'. The status guard means only rows still
        // claimable are flipped + returned (best-effort atomicity, see header).
        const { data: claimed, error: updErr } = await client
          .from('hsin_job_queue')
          .update({ status: 'running', started_at: opts.now })
          .in('id', ids)
          .in('status', ['queued', 'retrying'])
          .select('*');
        if (updErr || !claimed) return [];

        const jobs = (claimed as HsinJobQueueRecord[]).map(rowToJob);
        // Preserve the requested claim order (priority desc, scheduled asc).
        jobs.sort(
          (a, b) =>
            b.priority - a.priority ||
            a.scheduledFor.localeCompare(b.scheduledFor),
        );
        return jobs;
      } catch {
        return [];
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
     * Decide retry vs terminal-fail via the engine, then persist: on retry set
     * status='retrying' + scheduled_for=nextRunAt and bump attempt_count; on
     * terminal set status='failed' + finished_at. Returns the engine decision.
     */
    async markFailedOrRetry(
      jobId: string,
      now: string,
      error: string,
      policy: RetryPolicy,
    ): Promise<{ retried: boolean; nextRunAt?: string }> {
      try {
        const { data: row } = await client
          .from('hsin_job_queue')
          .select('attempt_count, max_attempts')
          .eq('id', jobId)
          .maybeSingle();
        const attemptCount =
          (row?.attempt_count as number | undefined) ?? 0;
        const maxAttempts =
          (row?.max_attempts as number | undefined) ?? policy.maxAttempts;

        // attempt_count reflects attempts already made; bump it for this failure.
        const newAttemptCount = attemptCount + 1;
        const decision = decideAfterFailure(
          { attemptCount: newAttemptCount, maxAttempts },
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
              attempt_count: newAttemptCount,
              started_at: null,
            })
            .eq('id', jobId);
          return { retried: true, nextRunAt: decision.nextRunAt };
        }

        await client
          .from('hsin_job_queue')
          .update({
            status: 'failed',
            finished_at: now,
            error_message: error,
            attempt_count: newAttemptCount,
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
