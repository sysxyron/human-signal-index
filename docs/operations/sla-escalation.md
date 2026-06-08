# Operations: SLA Escalation (HSI Phase 9)

The SLA escalation worker is a **watchdog**: it finds review items that have
blown their SLA deadline and escalates them for human attention. It **never**
auto-publishes and **never** auto-decides a review — it only raises priority and
visibility so an overdue item isn't silently lost.

- Worker: [`apps/worker/jobs/sla-escalation-worker.ts`](../../apps/worker/jobs/sla-escalation-worker.ts).
- SLA math: [`@hsi/source-intelligence` `sla.ts`](../../packages/source-intelligence/src/sla.ts)
  (`slaStatus`, `computeSlaDeadlines`, `DEFAULT_SLA_POLICIES`).
- Tables: `review_queues`, `hsin_signal_reviews`, `notifications`, `audit_logs`.

---

## SLA policies

Policies (by severity) define how long until a human review should start, then
until the item must be **escalated** if still unreviewed:

| Policy   | Severity   | Review deadline | Escalation deadline |
|----------|------------|-----------------|---------------------|
| Critical | `CRITICAL` | 2 h             | 4 h                 |
| High     | `HIGH`     | 8 h             | 24 h                |
| Medium   | `MEDIUM`   | 48 h            | 96 h                |
| Low      | `LOW`      | 168 h (7 d)     | 336 h (14 d)        |

`slaStatus(policy, createdAt, now, reviewedAt?)` classifies each item as
`on_track` / `due_soon` / `overdue_review` / `overdue_escalation`. A completed
review before the review deadline stops the clock (`on_track`). For
`review_queues` (which has no severity column) the worker maps the row's
**priority** to a severity (`urgent→CRITICAL`, `high→HIGH`, `low→LOW`, else
`MEDIUM`).

## Schedule

Cron `*/15 * * * *` — every 15 minutes, invoked by the external scheduler (with
`CRON_SECRET`). Each pass loads open items, computes SLA status, and escalates the
overdue ones.

## Overdue → escalation flow

```
   load open review items (review_queues: draft/under_review/needs_evidence)
                 │  per item: slaStatus(policy, createdAt, now, reviewedAt)
       ┌─────────┼───────────────┬───────────────────────┐
       ▼         ▼               ▼                       ▼
   on_track   due_soon     overdue_review          overdue_escalation
   (skip)     (skip)        │ priority→high          │ priority→urgent
                            └──────────┬─────────────┘
                                       ▼
                       1) status='escalated' + priority bump   (review_queues)
                       2) notifications insert (assignee)
                       3) audit_logs insert  action='sla.escalation'
                       4) NEVER auto-publish / auto-decide
```

Items already `escalated`/`approved`/`published`/`rejected` are skipped.

## What each overdue item produces

1. **Escalate** — `review_queues.status='escalated'`, `priority` bumped to `high`
   (overdue_review) or `urgent` (overdue_escalation).
2. **Notify** — a `notifications` row for the assignee:
   `type='sla_escalation'`, with the rationale (severity, deadlines, hours
   overdue) in the body.
3. **Audit** — an append-only `audit_logs` row: `action='sla.escalation'`,
   `metadata` capturing the item, its deadlines, the new priority, the rationale,
   and `autoPublished: false`.

## Never auto-publish (binding)

The worker's declared inputs log `autoPublish: false`. Escalation changes
**priority/visibility only**; the actual review decision (approve/reject/needs
research) and any publication remain a human action governed by the review
queue + publishing checklist. There is no code path from this worker to a
published artifact.

## Inspect escalations

```sql
-- Recently escalated review items.
select id, entity_type, entity_id, status, priority, updated_at
  from public.review_queues
 where status = 'escalated'
 order by updated_at desc
 limit 50;

-- The audit trail.
select created_at, action, metadata
  from public.audit_logs
 where action = 'sla.escalation'
 order by created_at desc
 limit 50;
```

## Offline-safety

The worker uses an injected loader/persister. The defaults are DB-backed but
**degrade to a clean no-op** when no service-role env is configured (`load`
returns `[]`, `persist` is a no-op) — so an offline run scans nothing, writes
nothing, and never throws. ICM: declared inputs + a structured summary
(`scanned`, `overdueReview`, `overdueEscalation`, `escalated`, `notified`,
`audited`, `skipped`, `failed`) are logged each pass.
