# Worker Operations (HSI Phase 8)

How to run, enable, and monitor the Phase-8 workers, and how to handle failed or
stuck jobs.

All workers are **offline-safe and disabled by default**. With empty env they
run as deterministic no-ops (no DB, no network), so a fresh checkout never needs
credentials to boot.

---

## The Phase-8 jobs

Registered in [`apps/worker/jobs/index.ts`](../../apps/worker/jobs/index.ts):

| Job (`name`) | Cron | Env gate | Does |
| --- | --- | --- | --- |
| `schedulerRunner` | `* * * * *` | `SCHEDULER_ENABLED=true` | Fires due scheduler rules → enqueues jobs, advances cron cursor, audits `rule_fired`. |
| `queueWorker` | `* * * * *` | `QUEUE_WORKER_ENABLED=true` | Drains the queue: claims due jobs, runs handlers, retries/fails per policy. |
| `captureWorker` | `0 */2 * * *` | (offline fixtures unless `SIGNAL_CAPTURE_MODE=live`) | Captures PUBLIC sources, de-dupes, emits signal drafts + alerts. |
| `classificationWorker` | `*/15 * * * *` | — | Classifies unclassified signals (lexical + optional embeddings). |
| `driftWorker` | `0 */6 * * *` | — | Detects narrative drift across recent snapshot timelines. |
| `alertWorker` | `*/10 * * * *` | — | Generates explainable alert drafts from signals/drift/watchlists. |
| `triageWorker` | `*/15 * * * *` | `SIGNAL_AUTO_CREATE_RESEARCH_DRAFTS` (default false) | Routes signals to review via the triage rule-engine. |

`schedulerRunner` and `queueWorker` **skip cleanly** (log `…skipped` and return
`ok:true`) unless their flag is `true`. The other four use injected loaders that
default to empty/offline, so they run but process nothing until wired.

---

## Running locally

```sh
# One pass over every registered job (requires CRON_SECRET set).
pnpm --filter @hsi/worker dev

# Typecheck the worker.
pnpm --filter @hsi/worker build   # tsc --noEmit
```

Each job logs structured JSON lines (`service: "hsi-worker"`) with **declared
inputs** on start and **outputs** on done (ICM). Example offline run:

```json
{"message":"job.schedulerRunner.skipped","reason":"disabled (SCHEDULER_ENABLED!==\"true\")"}
{"message":"job.captureWorker.start","declaredInputs":{"sourceCount":3,"mode":"fixture"}}
{"message":"job.captureWorker.done","captured":3,"duplicates":0,"alerts":2,"failed":0}
{"message":"job.triageWorker.done","triaged":0,"actionsEmitted":0,"researchDowngraded":0}
```

To exercise the live queue locally: set `SUPABASE_*` (incl.
`SUPABASE_SERVICE_ROLE_KEY`), `SCHEDULER_ENABLED=true`, `QUEUE_WORKER_ENABLED=true`,
seed a row in `hsin_scheduler_rules`, then invoke `schedulerRunner` then
`queueWorker`.

---

## Monitoring the queue

The queue lives in `hsin_job_queue`; per-attempt history in `hsin_job_attempts`.
Reviewer+ can read both (RLS); the worker writes via service-role.

```sql
-- Queue depth by state.
select status, count(*) from public.hsin_job_queue group by status;

-- Oldest waiting jobs.
select id, job_type, status, priority, scheduled_for, attempt_count, max_attempts
from public.hsin_job_queue
where status in ('queued','retrying')
order by scheduled_for asc limit 20;

-- Recently failed.
select id, job_type, error_message, attempt_count, finished_at
from public.hsin_job_queue
where status = 'failed'
order by finished_at desc limit 20;
```

The structured logs also carry the runner summary each pass:
`{"message":"job.queueWorker.done","claimed":N,"completed":N,"failed":N,"retried":N}`.

---

## Reading attempts & audit

```sql
-- Full attempt history for a job (running → completed/retrying/failed).
select attempt_number, status, started_at, finished_at, error_message, log_json
from public.hsin_job_attempts
where job_id = '<job-uuid>'
order by attempt_number asc;
```

Audit events (`job_created`, `rule_fired`, `job_claimed`, `job_completed`,
`retry_scheduled`, `job_failed`, `job_cancelled`) are emitted by the runner via
`createAuditSink`; route the sink to your log pipeline (or persist) to keep a
durable trail. See [scheduler-queue](../architecture/scheduler-queue.md).

---

## Handling failed / stuck jobs

**Failed (terminal).** Inspect `error_message` + the last `hsin_job_attempts`
row. Once the cause is fixed, re-drive by re-enqueuing or resetting:

```sql
update public.hsin_job_queue
   set status='queued', scheduled_for=now(), attempt_count=0, error_message=null
 where id='<job-uuid>';
```

**Stuck in `running`.** With a single drainer this shouldn't happen; if a worker
crashed mid-job, the row stays `running`. Reset stale ones (older than, say, your
longest job):

```sql
update public.hsin_job_queue
   set status='retrying', scheduled_for=now(), started_at=null
 where status='running' and started_at < now() - interval '15 minutes';
```

**Retry storm / flaky source.** Per-source backoff already widens delays; you
can also `cancel` the job or disable the source/scheduler rule:

```sql
update public.hsin_scheduler_rules set enabled=false where id='<rule-uuid>';
```

**Kill switch.** Set `QUEUE_WORKER_ENABLED=false` (drains stop immediately) and
`SCHEDULER_ENABLED=false` (no new jobs enqueued). Existing rows are untouched.
