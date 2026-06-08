# @hsi/scheduler

Production **scheduler + job-queue engine** for WorldForge / HSI Phase 8.

- **Pure TypeScript, zero runtime dependencies.**
- **Deterministic:** no `Date.now()` / `Math.random()` inside logic. The clock
  (`now: string`) and a `seed` are injected by the caller. Jitter is derived
  deterministically from the seed.
- **Offline-first:** ships in-memory stores for tests and local runs. The
  DB-backed store is implemented by the app/worker against the ports below —
  **not** in this package.

```ts
import {
  createRunner,
  enqueue,
  InMemoryQueueStore,
  createAuditSink,
  DEFAULT_RETRY_POLICY,
  JOB_TYPES,
} from '@hsi/scheduler';

const store = new InMemoryQueueStore();
const audit = createAuditSink();
const now = '2026-06-06T10:00:00.000Z';

await enqueue(store, { jobType: JOB_TYPES.capture, priority: 5 }, now, audit);

const runner = createRunner({
  store,
  handlers: {
    [JOB_TYPES.capture]: async (job) => ({ ok: true, log: { id: job.id } }),
  },
  policy: DEFAULT_RETRY_POLICY,
  audit,
  now,
});

const summary = await runner.runOnce({ now, limit: 25 });
// { claimed, completed, failed, retried }
```

## Ports (implemented by the app/worker)

### `QueueStore`

The DB-agnostic job-queue port. Implement against Supabase (or any store).

```ts
interface QueueStore {
  enqueue(input: EnqueueInput, now: string): Promise<Job>;
  // Atomically move due queued/retrying jobs (scheduledFor <= now) to running,
  // ordered priority desc, then scheduledFor asc, then createdAt asc.
  claimNext(opts: { now: string; jobTypes?: string[]; limit?: number }): Promise<Job[]>;
  markCompleted(jobId: string, now: string, log?: Record<string, unknown>): Promise<void>;
  markFailedOrRetry(
    jobId: string, now: string, error: string, policy: RetryPolicy,
  ): Promise<{ retried: boolean; nextRunAt?: string }>;
  recordAttempt(attempt: JobAttempt): Promise<void>;
  cancel(jobId: string, now: string): Promise<void>;
  get(jobId: string): Promise<Job | null>;
}
```

**Supabase implementation notes**

- `claimNext` should use a single atomic statement, e.g. an
  `UPDATE ... SET status='running' WHERE id IN (SELECT id ... FOR UPDATE SKIP LOCKED ...) RETURNING *`,
  filtering `status IN ('queued','retrying') AND scheduled_for <= now` and
  ordering `priority DESC, scheduled_for ASC, created_at ASC LIMIT :limit`.
- `markFailedOrRetry` should call `decideAfterFailure(job, policy, now, seed)`
  from this package to compute the next run, then persist `status` +
  `scheduled_for`.
- Mirror the `Job` / `JobAttempt` field names to your table columns.

### `DedupeStore`

```ts
interface DedupeStore {
  seen(key: string): Promise<{ firstSeenAt: string; lastSeenAt: string; signalId?: string } | null>;
  remember(key: string, now: string, signalId?: string): Promise<void>;
}
```

Build keys with `dedupeKey(sourceId, contentHash, canonicalUrl?)` and gate
ingestion with `isDuplicate(store, sourceId, contentHash, canonicalUrl, now)`.

### Offline in-memory stores

- `InMemoryQueueStore` — deterministic, Map-backed `QueueStore` (seeded id
  counter; ordering by priority/scheduledFor/createdAt; retry via the policy).
- `InMemoryDedupeStore` — Map-backed `DedupeStore`.

## API by module

### `types`
`JobType`, `JobStatus`, `Job`, `JobAttempt`, `EnqueueInput`, `SchedulerRule`,
`RetryPolicy`, `AuditEvent`, `AuditEventType`, `QueueStore`, plus the
`JOB_TYPES` constant (`capture`, `classify`, `drift`, `alert`, `triage`,
`scheduler`).

### `backoff`
- `computeBackoffSeconds(attempt, policy, seed?): number` — exponential
  `base * factor^(attempt-1)`, capped at `maxBackoffSeconds`, deterministic
  jitter from `seed`.
- `nextRunAt(now, backoffSeconds): string`.

### `retry`
- `shouldRetry(job, policy): boolean`
- `decideAfterFailure(job, policy, now, seed?): { status; nextRunAt?; backoffSeconds? }`
- `withPerSourceBackoff(job, policy, now, failureCount, seed?)` — inflates
  backoff by `1 + failureCount` for flaky sources.

### `cron` (UTC, 5-field: `min hour dom month dow`)
- Supports `*`, lists `1,2`, ranges `1-5`, steps `*/5`, `1-30/2`; macros
  `@hourly` `@daily` `@weekly` `@monthly` `@yearly` and `@every_Nm` / `@every_Nh`.
- `parseCron(expr): CronSpec`
- `nextRunAfter(expr, afterISO): string` (next matching minute, bounded ~366 days)
- `isDue(expr, atISO, lastRunISO?): boolean`
- `describeCron(expr): string`
- Throws `CronParseError` on invalid input.

### `queue`
- `class InMemoryQueueStore implements QueueStore`
- `nextDueRules(rules, now): SchedulerRule[]`
- `advanceRule(rule, now): SchedulerRule` (`lastRunAt = now`, recompute `nextRunAt`)

### `dedupe`
- `dedupeKey(sourceId, contentHash, canonicalUrl?): string`
- `DedupeStore`, `class InMemoryDedupeStore`
- `isDuplicate(store, sourceId, contentHash, canonicalUrl, now, signalId?)`

### `audit`
- `createAuditSink(emit?): { record(event); events() }`
- Builders: `jobCreated`, `jobClaimed`, `jobCompleted`, `jobFailed`,
  `retryScheduled`, `jobCancelled`, `ruleFired`.

### `runner`
- `createRunner({ store, handlers, policy, audit?, now }): { runOnce(opts) }`
  — claims due jobs, records a `running` attempt, runs each handler in a
  try/catch (a throwing handler never crashes the runner), then completes or
  routes failure through the retry policy. Returns
  `{ claimed, completed, failed, retried }`.
- `enqueue(store, input, now, audit?): Promise<Job>`

### top-level
- `JOB_TYPES`, `DEFAULT_RETRY_POLICY`.

## Tests

```sh
node node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs --test packages/scheduler/tests/<file>
```

Suites: `cron.test.ts`, `queue.test.ts`, `retry.test.ts`, `dedupe.test.ts`,
`runner.test.ts`. All deterministic with a fixed `now`.

## Limitations

- Cron is 5-field and **UTC-only** (no seconds field, no `L`/`W`/`#`
  specifiers, no timezone offsets).
- `nextRunAfter` look-ahead is bounded to ~366 days; impossible schedules
  (e.g. `0 0 30 2 *`) throw `RangeError`.
- `InMemoryQueueStore` is single-process and not durable — intended for tests
  and offline use only. Real concurrency/atomicity is the DB store's job.
- Backoff is rounded to whole seconds.
