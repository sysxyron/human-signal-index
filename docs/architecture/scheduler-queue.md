# Scheduler & Job Queue (HSI Phase 8)

The **scheduler + job-queue** is the operational backbone that drives the Phase-7
signal observatory. It turns cron-style **rules** into durable **jobs**, drains
those jobs through **workers**, and routes failures through a deterministic
**retry/backoff** policy — all auditable, all offline-safe.

- Engine: [`@hsi/scheduler`](../../packages/scheduler) — pure, deterministic,
  zero-dependency. It defines the ports and ships in-memory stores; it never
  reads the clock or env.
- Worker adapters: [`apps/worker/lib/queue-store.ts`](../../apps/worker/lib/queue-store.ts),
  [`apps/worker/lib/config.ts`](../../apps/worker/lib/config.ts).
- Jobs: [`apps/worker/jobs/scheduler-runner.ts`](../../apps/worker/jobs/scheduler-runner.ts)
  and [`queue-worker.ts`](../../apps/worker/jobs/queue-worker.ts).
- Schema: migration `0012` (`hsin_job_queue`, `hsin_job_attempts`,
  `hsin_scheduler_rules`, `hsin_capture_dedupes`).

---

## End-to-end flow

```
                 cron tick (every minute, external scheduler → CRON_SECRET)
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │      schedulerRunnerJob        │   reads hsin_scheduler_rules
                    │  nextDueRules(rules, now)      │   (enabled + nextRunAt<=now)
                    └───────────────┬───────────────┘
                       for each due rule:
                       1. enqueue(jobType) ──────────┐
                       2. advanceRule(next cron)     │  audit: rule_fired
                       3. persist next_run_at        │
                                                     ▼
                                       ┌───────────────────────────┐
                                       │       hsin_job_queue        │
                                       │  queued | retrying ...      │
                                       └─────────────┬───────────────┘
                                                     │ claimNext(limit=BATCH)
                                                     ▼
                    ┌───────────────────────────────────────────────┐
                    │                 queueWorkerJob                  │
                    │  createRunner({store,handlers,policy,audit})    │
                    │  runOnce({ now, limit: SIGNAL_QUEUE_BATCH_SIZE })│
                    └───────────────┬───────────────────────────────┘
            dispatch by jobType to per-type handlers:
            capture → classify → drift → alert → triage
                                    │
              ┌─────────────────────┼──────────────────────┐
              ▼                     ▼                      ▼
         ok → markCompleted    throws/ok:false →      records every attempt
         + record attempt      markFailedOrRetry      → hsin_job_attempts
                               (decideAfterFailure)
                                    │
                       retries left? ── yes ─► status=retrying, scheduled_for=now+backoff
                                     └─ no ──► status=failed (terminal)
```

The default production topology is a **single drainer**: an external scheduler
hits two endpoints each minute (one per job). Both jobs are **disabled by
default** and only act when `SCHEDULER_ENABLED` / `QUEUE_WORKER_ENABLED` are
`true` *and* a service-role Supabase key is configured — otherwise they run
against the in-memory store and no-op cleanly.

---

## The `QueueStore` port + Supabase implementation

`@hsi/scheduler` defines the DB-agnostic port; the worker implements it.

```ts
interface QueueStore {
  enqueue(input, now): Promise<Job>;
  claimNext({ now, jobTypes?, limit? }): Promise<Job[]>;       // due → running
  markCompleted(jobId, now, log?): Promise<void>;
  markFailedOrRetry(jobId, now, error, policy): Promise<{ retried; nextRunAt? }>;
  recordAttempt(attempt): Promise<void>;                       // append-only log
  cancel(jobId, now): Promise<void>;
  get(jobId): Promise<Job | null>;
}
```

`apps/worker/lib/queue-store.ts` provides two adapters via factories that
**never throw**:

| Factory | Service-role env present | Service-role env absent |
| --- | --- | --- |
| `createWorkerQueueStore()` | `SupabaseQueueStore` over `hsin_job_queue` / `hsin_job_attempts` | `InMemoryQueueStore` (offline) |
| `createWorkerDedupeStore()` | `SupabaseDedupeStore` over `hsin_capture_dedupes` | `InMemoryDedupeStore` (offline) |

The Supabase store uses the **service-role** client (bypasses RLS — server-only,
per migration `0012`). Column ↔ field mapping mirrors `0012` (`job_type`,
`payload_json`, `scheduled_for`, `attempt_count`, `max_attempts`, …).

### `claimNext` and atomicity

The reference Supabase `claimNext` issues a filtered `select` then a per-row
conditional `update` to `running`. This is **sufficient for a single drainer**
(the default topology). For **multiple concurrent workers**, replace it with a
single atomic statement to avoid double-claims:

```sql
UPDATE public.hsin_job_queue
   SET status = 'running', started_at = now(), attempt_count = attempt_count + 1
 WHERE id IN (
   SELECT id FROM public.hsin_job_queue
    WHERE status IN ('queued','retrying') AND scheduled_for <= now()
    ORDER BY priority DESC, scheduled_for ASC, created_at ASC
    LIMIT :limit
    FOR UPDATE SKIP LOCKED
 )
 RETURNING *;
```

Expose it as a Postgres function and call it via `rpc('claim_jobs', …)`.

---

## Job states

```
            enqueue                claim                handler ok
   ( · ) ─────────────► queued ───────────► running ───────────────► completed
                          ▲                   │
              backoff     │                   │ handler throws / ok:false
              elapsed     │                   ▼
                       retrying ◄──────── markFailedOrRetry ──► failed   (no retries left)
                          
   any non-terminal ──── cancel ────► cancelled
```

| State | Meaning |
| --- | --- |
| `queued` | enqueued, eligible once `scheduled_for <= now`. |
| `running` | claimed; an attempt is in flight (`hsin_job_attempts`). |
| `completed` | handler returned `ok:true`. Terminal. |
| `retrying` | failed but attempts remain; `scheduled_for = now + backoff`. |
| `failed` | failed with no attempts left. Terminal. |
| `cancelled` | manually cancelled. Terminal. |

---

## Retry, backoff & per-source backoff

`decideAfterFailure(job, policy, now, seed?)` computes the next run:

- **Exponential**: `base * factor^(attempt-1)`, capped at `maxBackoffSeconds`.
- **Deterministic jitter** derived from `seed` (no `Math.random()`).
- The worker builds the policy from env via `retryPolicyFromConfig()`:
  `maxAttempts=SIGNAL_JOB_MAX_ATTEMPTS` (default 3),
  `baseSeconds=SIGNAL_BACKOFF_BASE_SECONDS` (default 60), `factor=2`,
  `jitterRatio=0.1`, `maxBackoffSeconds=3600`.

With the defaults a job retries at roughly **+60s → +120s** before going
terminal at attempt 3.

**Per-source backoff** (`withPerSourceBackoff`) inflates the delay by
`1 + failureCount` for a flaky source, so repeated capture failures back off
faster without hammering the source. Migration `0012`'s `tr_source_failures`
triage rule degrades source health after 3 failures.

---

## Provider rate limits

Outbound capture/enrichment providers (YouTube, Podcast Index, …) are tracked in
`hsin_provider_accounts` (enabled + config) and `hsin_provider_rate_limits`
(window, max, remaining, reset_at). The worker reads the current window via
service-role before a live call, decrements `remaining_requests`, and defers the
job (re-enqueue with a later `scheduled_for`) when the window is exhausted. Live
capture additionally honors `SIGNAL_CAPTURE_USER_AGENT`, `SIGNAL_CAPTURE_TIMEOUT_MS`
and `SIGNAL_CAPTURE_MAX_BYTES`. See [source-monitoring-production](../operations/source-monitoring-production.md).

---

## Audit logging

Every state transition emits a structured `AuditEvent` via
`createAuditSink()`:

| Event | Emitted when |
| --- | --- |
| `job_created` | `enqueue` (rule fired or manual). |
| `rule_fired` | a scheduler rule fired and enqueued a job. |
| `job_claimed` | runner claimed a due job. |
| `job_completed` | handler succeeded. |
| `retry_scheduled` | failure with retries remaining. |
| `job_failed` | terminal failure. |
| `job_cancelled` | manual cancel. |

The runner also writes one `hsin_job_attempts` row per attempt
(`running` → `completed`/`retrying`/`failed`) with an arbitrary structured `log`.
These two trails (audit events + attempt rows) are how operators reconstruct
exactly what happened — see [worker-ops](../operations/worker-ops.md).

---

## Offline safety (binding)

- Both jobs are **disabled** unless their env flag is `true`.
- Loaders default to **no-op** (zero rules / zero jobs); stores default to
  **in-memory** when no service-role key is set.
- The runner isolates per-job failures: a throwing handler never crashes the
  process — it routes to retry/fail. Store/audit writes are best-effort.
- The whole subsystem runs **with empty env** as a deterministic no-op.
