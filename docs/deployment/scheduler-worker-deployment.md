# Scheduler & Worker Deployment (HSI Phase 8)

Deploying the Phase-8 worker (`@hsi/worker`) and driving it from an external
scheduler. The worker has **no internal clock loop**: an external scheduler
invokes its jobs on a cadence, guarded by `CRON_SECRET`.

---

## Topology

```
   ┌────────────────────┐    HTTPS + Authorization: Bearer $CRON_SECRET
   │  Vercel Cron  OR    │ ─────────────────────────────────────────────►  ┌──────────────────┐
   │  external scheduler │  POST /api/cron/scheduler-runner   (* * * * *)   │   @hsi/worker     │
   │  (systemd timer,    │  POST /api/cron/queue-worker       (* * * * *)   │  runJob(name,ctx) │
   │   GH Actions, k8s   │  POST /api/cron/capture-worker     (0 */2 * * *) │                   │
   │   CronJob, ...)     │  POST /api/cron/triage-worker      (*/15 * * * *)│  ┌──────────────┐ │
   └────────────────────┘                                                   │  │ QueueStore   │ │ ──► Supabase
                                                                            │  │ (service-role)│ │     hsin_*
                                                                            │  └──────────────┘ │
                                                                            └──────────────────┘
```

Each cron entry maps to one job `name` (see
[worker-ops](../operations/worker-ops.md) for the table). The handler:

1. Verifies `Authorization: Bearer $CRON_SECRET` via `assertCronSecret`.
2. Builds a `JobContext { config, runAt: new Date().toISOString() }`.
3. Calls `runJob(name, ctx)` from
   [`apps/worker/src/index.ts`](../../apps/worker/src/index.ts) — which logs,
   runs the job, and **never throws** (errors are captured + returned).

---

## CRON_SECRET

`CRON_SECRET` is **required**. Set a long random value in the worker env and as
the bearer token on every scheduler request. `assertCronSecret` rejects missing
or mismatched secrets, so unauthenticated callers cannot trigger jobs.

```sh
CRON_SECRET=$(openssl rand -hex 32)
# Scheduler sends:  Authorization: Bearer <CRON_SECRET>
```

### Vercel Cron example (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/scheduler-runner", "schedule": "* * * * *" },
    { "path": "/api/cron/queue-worker",      "schedule": "* * * * *" },
    { "path": "/api/cron/capture-worker",    "schedule": "0 */2 * * *" },
    { "path": "/api/cron/classification-worker", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/drift-worker",      "schedule": "0 */6 * * *" },
    { "path": "/api/cron/alert-worker",      "schedule": "*/10 * * * *" },
    { "path": "/api/cron/triage-worker",     "schedule": "*/15 * * * *" }
  ]
}
```

Each route reads the `Authorization` header, asserts `CRON_SECRET`, and calls
the matching `runJob`.

---

## Enabling the workers in production

The workers are **disabled by default**. To go live:

```ini
# Supabase service-role — REQUIRED for the durable queue (bypasses RLS, server-only).
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...        # never expose to the browser

CRON_SECRET=...                       # required

SCHEDULER_ENABLED=true                # let scheduler rules fire
QUEUE_WORKER_ENABLED=true             # let the queue drain
SIGNAL_CAPTURE_MODE=fixture           # keep fixtures until vetted; then 'live'
```

Without `SUPABASE_SERVICE_ROLE_KEY` the worker falls back to the **in-memory**
queue (non-durable, single-process) — fine for staging, not for production.

See [source-monitoring-production](../operations/source-monitoring-production.md)
before flipping `SIGNAL_CAPTURE_MODE=live`.

---

## Provider API keys (YouTube / Podcast Index)

Live capture/enrichment providers self-gate on their own keys; leave blank to
skip that provider.

```ini
YOUTUBE_API_KEY=
PODCAST_INDEX_API_KEY=
PODCAST_INDEX_API_SECRET=
```

Per-provider quotas/windows are tracked in `hsin_provider_accounts` +
`hsin_provider_rate_limits`; the worker honors `remaining_requests`/`reset_at`
and defers jobs when a window is exhausted.

---

## Scaling notes

- **Single drainer (default).** One `queueWorker` invocation per minute is
  enough for modest volume. The reference Supabase `claimNext` (select +
  per-row update) is safe for a single drainer.
- **Multiple concurrent workers.** Replace `claimNext` with an atomic
  `UPDATE … FOR UPDATE SKIP LOCKED` RPC (see
  [scheduler-queue](../architecture/scheduler-queue.md)) before running more
  than one drainer, to prevent double-claims.
- **Throughput.** Raise `SIGNAL_QUEUE_BATCH_SIZE` to drain more jobs per pass,
  or invoke `queueWorker` more frequently, or run a long-lived process that
  loops `runner.runOnce`.
- **Backpressure & failures.** Retries use exponential backoff
  (`SIGNAL_BACKOFF_BASE_SECONDS`, ×2, capped 1 h); per-source backoff widens
  delays for flaky sources. Monitor `hsin_job_queue` depth by status and the
  `queueWorker.done` summaries.
- **Kill switch.** Set `QUEUE_WORKER_ENABLED=false` and/or
  `SCHEDULER_ENABLED=false` to halt draining/enqueuing without touching data.
- **Observability.** Structured JSON logs (`service: "hsi-worker"`) are
  OpenTelemetry/Sentry-ready (set `SENTRY_DSN` to capture exceptions); see
  [`apps/worker/src/logger.ts`](../../apps/worker/src/logger.ts).
