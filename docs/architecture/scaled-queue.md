# Scaled Job Queue (HSI Phase 9)

Phase 9 hardens the Phase-8 queue for **multi-worker, at-scale** operation. The
core change: an **atomic, visibility-aware claim** via a Postgres
`FOR UPDATE SKIP LOCKED` RPC, plus a **dead-letter queue** for jobs that exhaust
their retries.

- Engine: [`@hsi/scheduler`](../../packages/scheduler) — `claimBatch`/`heartbeat`/
  `deadLetter` ports, `visibility.ts`, `deadletter.ts`, and the runner that
  prefers `claimBatch`.
- Worker adapter:
  [`apps/worker/lib/queue-store.ts`](../../apps/worker/lib/queue-store.ts)
  (`SupabaseQueueStore` implements `ScalableQueueStore`).
- Drainer: [`apps/worker/jobs/queue-worker.ts`](../../apps/worker/jobs/queue-worker.ts).
- Schema: migration `0013` — `hsin_job_queue.locked_until` +
  `dead_lettered_at`, `hsin_dead_letter_jobs`, and the `claim_hsin_jobs` RPC.

---

## The `claim_hsin_jobs` SKIP LOCKED RPC

A single server-side statement leases a disjoint batch of jobs so **N workers can
drain the queue concurrently without double-claiming**:

```sql
update hsin_job_queue q
   set status = 'running',
       started_at = now(),
       locked_until = now() + make_interval(secs => p_visibility_seconds),
       attempt_count = q.attempt_count + 1,
       updated_at = now()
 where q.id in (
   select id from hsin_job_queue
    where (status in ('queued','retrying') and scheduled_for <= now())   -- due
       or (status = 'running' and locked_until is not null               -- OR
           and locked_until < now())                                     -- reclaimable
    order by priority desc, scheduled_for asc, created_at asc
    limit p_limit
    for update skip locked            -- ◄── concurrent workers skip each other's rows
 )
 returning q.*;
```

```
   worker A ─┐                                  ┌─► batch A (rows 1,2,3)
             ├─ rpc claim_hsin_jobs(limit,vis) ─┤
   worker B ─┘   FOR UPDATE SKIP LOCKED         └─► batch B (rows 4,5,6)   (disjoint)
```

The worker calls it through `claimBatch({ now, limit, visibilitySeconds })`.

## Visibility timeout + lease reclaim

When a job is claimed it is stamped `locked_until = now + visibilitySeconds`
(default `HSIN_JOB_VISIBILITY_TIMEOUT_SECONDS=300`). If the worker **crashes or
stalls** mid-job, the lease eventually lapses and the SAME claim RPC will
**reclaim** the job (the `status='running' AND locked_until < now()` branch) — so
work is never lost. Long-running handlers can extend the lease via
`heartbeat(jobId, now, visibilitySeconds)`.

```
   claim ──► locked_until = T+300
            │
   worker dies at T+120 ........... lock still held until T+300
            │
   T+301: next claim sees locked_until < now ──► reclaim + re-run (attempt_count bumps)
```

## Dead-letter queue + requeue

A job that exhausts its retry budget (`shouldDeadLetter`: `attemptCount >=
min(job.maxAttempts, policy.maxAttempts)`) is **dead-lettered**: kept terminal
(`failed`, `dead_lettered_at` stamped) on the queue **and** snapshotted into
`hsin_dead_letter_jobs` (job type, source, payload, attempt counters, reason,
last error). This is gated by `HSIN_DEAD_LETTER_ENABLED` (default `true`).

```
 queued → running → (handler fails) → markFailedOrRetry
                                          │
              attempts left? ── yes ─► retrying (backoff, lock cleared)
                                          │
                                no ─► failed  ──►  hsin_dead_letter_jobs
                                                   (inspect / requeue)
```

Requeue is a human action (curator/admin): re-create a fresh `queued` job
(attempt count reset) and consume the parked entry. See
[operations/dead-letter-queue.md](../operations/dead-letter-queue.md).

## Multi-worker-safe design

- **Atomicity** lives in Postgres (`SKIP LOCKED`), not in app code — the worker
  never does a read-then-write claim race.
- The runner **prefers** `claimBatch` when the store implements it (Phase 9),
  else falls back to the legacy per-row `claimNext` (Phase-8 single-drainer).
- Each worker process just loops `runOnce` — add more processes to scale out.

## Retry / backoff

Failures route through `decideAfterFailure(job, policy, now)`:
`computeBackoffSeconds = base * factor^(attempt-1)`, capped at
`maxBackoffSeconds`, with deterministic jitter. A retrying job is re-scheduled
(`scheduled_for = nextRunAt`) and its **lease is cleared** (`locked_until = null`)
so it isn't mistaken for a claimed job.

| Knob                | Env                          | Default |
|---------------------|------------------------------|---------|
| Max attempts        | `SIGNAL_JOB_MAX_ATTEMPTS`    | `3`     |
| Backoff base (s)    | `SIGNAL_BACKOFF_BASE_SECONDS`| `60`    |
| Batch size          | `SIGNAL_QUEUE_BATCH_SIZE`    | `10`    |
| Visibility (s)      | `HSIN_JOB_VISIBILITY_TIMEOUT_SECONDS` | `300` |

## Job states

```
   queued ──claim──► running ──ok──► completed
      ▲                 │
      │                 ├─fail,retries left──► retrying ──(due)──► (claim)
      │                 │
      └──reclaim (lease expired)              │
                        └─fail,exhausted──► failed ──► hsin_dead_letter_jobs
                                                          │
                                                  requeue ┘ (manual → fresh queued)
   cancelled  (operator)
```

## Offline-safety

With no service-role env the worker uses the in-memory `InMemoryQueueStore` —
which itself implements `claimBatch`/`heartbeat`/`deadLetter` and owns an
`InMemoryDeadLetterStore` — so the full Phase-9 flow runs deterministically
offline with no DB. The drainer stays **disabled** unless
`QUEUE_WORKER_ENABLED=true`. Construction never throws.
