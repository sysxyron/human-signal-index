# Operations: Dead-Letter Queue (HSI Phase 9)

The dead-letter queue (DLQ) holds jobs that **exhausted their retry budget** so
they can be inspected and, if appropriate, re-driven — without blocking the live
queue. See the architecture in
[scaled-queue.md](../architecture/scaled-queue.md).

- Table: `hsin_dead_letter_jobs` (migration `0013`).
- Queue marker: `hsin_job_queue.dead_lettered_at`.
- Writer: [`apps/worker/lib/queue-store.ts`](../../apps/worker/lib/queue-store.ts)
  (`SupabaseQueueStore.deadLetter` / inside `markFailedOrRetry`).
- Toggle: `HSIN_DEAD_LETTER_ENABLED` (default `true`).

---

## What gets dead-lettered

A job is dead-lettered when, after a handler failure, its attempts are exhausted:
`attempt_count >= min(job.max_attempts, policy.maxAttempts)`. The worker then:

1. Marks the queue row terminal: `status='failed'`, `dead_lettered_at=now`,
   `locked_until=null`.
2. Inserts a snapshot into `hsin_dead_letter_jobs`: `job_id`, `job_type`,
   `source_id`, `payload_json`, `attempt_count`, `max_attempts`, `reason`,
   `last_error`, `dead_lettered_at`.

```
   running ─fail (attempts exhausted)─► failed
                                          │
                                          └─► hsin_dead_letter_jobs (snapshot)
```

If `HSIN_DEAD_LETTER_ENABLED=false`, the job still goes `failed` but no DLQ row is
written.

## Inspect the DLQ

DLQ rows are **operational** (access shape A in `0013`): reviewer+ may read;
curator/admin may write (requeue/clear). Newest first:

```sql
select id, job_id, job_type, source_id, attempt_count, max_attempts,
       reason, last_error, dead_lettered_at, requeued_at
  from public.hsin_dead_letter_jobs
 order by dead_lettered_at desc
 limit 50;
```

Look at `reason` (e.g. "max attempts (3/3) exhausted") and `last_error` to decide
whether the failure is transient (requeue) or a genuine bug/poison payload (fix
first).

## Requeue a job (curator/admin)

Requeue re-creates a **fresh** `queued` job (attempt count reset to 0) and
consumes the DLQ entry. The engine models this as
`InMemoryQueueStore.requeueFromDeadLetter`; against Supabase, perform the
equivalent: re-enqueue from the snapshot and mark the DLQ row requeued.

```sql
-- 1. Re-enqueue a fresh job from the snapshot.
insert into public.hsin_job_queue
  (job_type, status, priority, source_id, payload_json, scheduled_for,
   attempt_count, max_attempts)
select job_type, 'queued', 5, source_id, payload_json, now(), 0, max_attempts
  from public.hsin_dead_letter_jobs
 where id = '<dlq_id>';

-- 2. Mark the DLQ entry requeued (consumed).
update public.hsin_dead_letter_jobs
   set requeued_at = now()
 where id = '<dlq_id>';
```

Only requeue after the root cause is understood — re-driving a poison job just
re-fills the DLQ.

## Recover stuck jobs (visibility timeout)

A job whose worker crashed is **not** in the DLQ — it's still `running` with an
expired `locked_until`. The `claim_hsin_jobs` RPC automatically **reclaims** it on
the next drain (it re-selects `status='running' AND locked_until < now()`). To
check for stuck jobs:

```sql
select id, job_type, status, locked_until, attempt_count, max_attempts
  from public.hsin_job_queue
 where status = 'running' and locked_until < now()
 order by locked_until asc;
```

These will be reclaimed automatically on the next `queueWorker` tick — you should
not need to touch them. If a job keeps getting reclaimed and re-failing it will
eventually exhaust attempts and land in the DLQ.

## Offline note

With no service-role env the worker uses the in-memory store + in-memory DLQ —
useful for tests but not durable. Configure Supabase + a service-role key for a
real, inspectable DLQ.
