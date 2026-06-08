# Review System — WorldForge Phase 6 (Human Review & Curation)

The review system layers a **human-in-the-loop** governance workflow on top of
the Phases 1–5 research/evidence pipeline. Researchers submit entities for
review; reviewers triage, assign, and record verdicts; curators publish; and
every reviewer verdict feeds back into a recomputed **Governed Confidence** on
the underlying research run.

> Persistence: migration `0010_review_and_curation.sql` (8 new tables + 2
> additive `research_runs` columns + the 5-role ladder). DAL:
> `apps/web/lib/governance/persistence.ts`. Server actions:
> `apps/web/app/dashboard/review/actions.ts`.

---

## 1. Workflow

```
            createReviewQueue (researcher+)
                     │
                     ▼
   ┌────────────────────────────────┐
   │            DRAFT                │   (initial DB default; the DAL submits
   │                                 │    directly as UNDER_REVIEW)
   └────────────────────────────────┘
                     │
        assignReviewer (curator/admin)
                     ▼
   ┌────────────────────────────────┐
   │         UNDER_REVIEW            │◀──────────────┐
   └────────────────────────────────┘               │
            │ submitReviewDecision (reviewer+)       │ (re-review after
            │                                        │  more evidence)
   ┌────────┼─────────────┬───────────────┐          │
   ▼        ▼             ▼               ▼          │
APPROVE   REJECT     NEEDS_EVIDENCE     ESCALATE     │
   │        │             │               │          │
   ▼        ▼             ▼               ▼          │
APPROVED  REJECTED   NEEDS_EVIDENCE ───▶  ESCALATED ─┘
   │                                       (stays visible; curator/admin
   │ publishEntity (curator+)               triages — never auto-resolved)
   ▼
PUBLISHED
```

Status values mirror `review_queues.status`:
`draft · under_review · approved · published · rejected · needs_evidence · escalated`.

**Honesty principle.** The DAL stores the *real* decision. `ESCALATE` leaves the
item `escalated` and surfaced on the curation dashboard; it is never silently
approved or hidden. `NEEDS_EVIDENCE` returns the item to the researcher to gather
more evidence (Phase 4/5), after which it can be re-reviewed.

---

## 2. The 8 tables

| Table                   | Purpose                                                                 |
|-------------------------|-------------------------------------------------------------------------|
| `review_queues`         | One entry per entity submitted for review. `status` drives the workflow; `priority` orders the worklist; `assigned_to` is the reviewer; `created_by` the submitter. |
| `review_assignments`    | Assignment history (reviewer + `assigned_at` / `completed_at`). Re-assignment appends rows. |
| `review_decisions`      | Immutable reviewer verdicts (`APPROVE/REJECT/NEEDS_EVIDENCE/ESCALATE`) + `notes`. |
| `publication_records`   | A published entity + its `visibility` tier + `latest_version` pointer. |
| `publication_versions`  | Immutable snapshot per `(record, version_number)`; `snapshot_json` is the frozen `PublicReportDraft`. |
| `review_comments`       | Threaded collaboration comments (`parent_id`) with `@mentions` (`uuid[]`). |
| `reviewer_trust`        | Per-reviewer aggregate: `approved_count / reversed_count / review_count / trust_score`. |
| `notifications`         | Per-user notifications (`type`, `title`, `body`, soft entity link, `read`). |

Two **additive** columns on `research_runs`:
`governed_confidence numeric` (0..100, post-review) and `review_status text`
(mirrors the latest queue status) — surfaced so the dashboard renders without a
join.

---

## 3. Role model + permission matrix

Ascending ladder: **viewer < researcher < reviewer < curator < admin**
(SQL helpers `has_role`, `is_researcher_or_above`, `is_reviewer_or_above`,
`is_curator_or_admin`, `is_admin`). The DAL gates in-process via
`getSessionRole()` (returning `FORBIDDEN` below the required tier,
`AUTH_REQUIRED` when anonymous) **and** RLS is the backstop — defence in depth.

| Capability                                   | Viewer | Researcher | Reviewer | Curator | Admin |
|----------------------------------------------|:------:|:----------:|:--------:|:-------:|:-----:|
| Read PUBLIC publications                      |   ✔    |     ✔      |    ✔     |    ✔    |   ✔   |
| Read TEAM publications (any authed)           |        |     ✔      |    ✔     |    ✔    |   ✔   |
| Create research runs / submit to review queue |        |     ✔      |    ✔     |    ✔    |   ✔   |
| Comment (threaded, mentions)                  |        |     ✔      |    ✔     |    ✔    |   ✔   |
| Read full review queue                        |        |            |    ✔     |    ✔    |   ✔   |
| Submit review decisions                       |        |            |    ✔     |    ✔    |   ✔   |
| Complete own assignment                       |        |            |    ✔     |    ✔    |   ✔   |
| Assign reviewers                              |        |            |          |    ✔    |   ✔   |
| Publish / republish / change visibility       |        |            |          |    ✔    |   ✔   |
| Curation dashboard                            |        |            |    ✔     |    ✔    |   ✔   |
| Everything                                    |        |            |          |         |   ✔   |

(Researchers and below see only their *own* queue submissions via RLS; reviewer+
see all.)

---

## 4. Reviewer trust formula

Trust is derived purely (`computeReviewerTrust` in `@hsi/research-agents`) from
three counters maintained in `reviewer_trust`:

```
approvalRate    = approvedCount / max(1, reviewCount)
reversalPenalty = reversedCount / max(1, reviewCount)
activityBonus   = reviewCount / (reviewCount + 10)        // saturating

trustScore = clamp01(
    0.5                                          // neutral anchor
  + 0.4 * (approvalRate - 2 * reversalPenalty)   // approvals up, reversals 2× down
  + 0.1 * activityBonus                          // sustained activity nudges up
)
```

- **0 reviews → 0.5** (neutral / unknown).
- Many clean approvals → ≈ 1.0.
- Reversals are penalised at 2× and drive trust down fast.

**Reversal heuristic (assumption).** The DAL has no explicit "your verdict was
overturned" signal, so `reversedCount` is computed from each queue's *final*
status vs the reviewer's verdict: an `APPROVE` on a queue that ended
`rejected`/`escalated`, or a `REJECT` on one that ended `approved`/`published`,
counts as a reversal. This is a heuristic — a dedicated reversal event table
would be more precise. Documented here and in the reviewer guide.

Trust is recomputed and upserted on every `submitReviewDecision`.

---

## 5. The review → governance loop

This is the heart of Phase 6. On each `submitReviewDecision` for a
`research_run` entity:

```
all decisions for the queue
        │  (each tagged with the reviewer's trust_score)
        ▼
aggregateReviewerValidation(decisions)  →  reviewerValidation ∈ [0,1]
        │   APPROVE→1.0  REJECT→0.0  NEEDS_EVIDENCE→0.35  ESCALATE→0.4
        │   (trust-weighted mean; no decisions → 0.5 neutral)
        ▼
governedConfidence({
  researchConfidence,   // consensus overallConfidence (0..100)
  evidenceConfidence,   // coverage.evidenceWeightedConfidence ?? coverageScore
  reviewerValidation,   // from above
  reviewerTrust,        // mean reviewer trust
  reviewCount,          // # decisions
})  →  governedConfidence ∈ [0,100]
        ▼
UPDATE research_runs SET governed_confidence = …, review_status = <queue.status>
```

Baseline is a 50/50 research+evidence blend. The reviewer term is **centered at
0.5** — an unreviewed item is *not* penalised; validation lifts the score,
rejection drops it, and the swing scales with reviewer trust × review-count
confidence (saturating at ~3 reviews). All math is the **pure**
`@hsi/research-agents` engine — no DB logic in the engine, no engine logic in
the DAL.

The recompute is **best-effort**: if it fails, the decision itself still
persists (the verdict is the source of truth; the score is derived).

---

## 6. Audit trail

Governance mutations reuse the **existing** `audit_logs` table (migration 0001:
`id, user_id, action, metadata jsonb, created_at`). The DAL's internal
`recordAudit(client, userId, action, entityType, entityId, extra?)` helper writes
one row per action with a standardized metadata shape:

```jsonc
{ "entity_type": "research_run", "entity_id": "<uuid>", /* + action-specific extra */ }
```

`getAuditTrail(entityType, entityId)` reads back via
`metadata->>entity_type` / `metadata->>entity_id`. Actions logged:
`review_queue_created`, `review_assigned`, `review_decision_submitted`,
`entity_published`, `entity_republished`, `publication_visibility_updated`,
`comment_added`. Audit writes are best-effort and never fail the mutation.

---

## 7. Notifications

`notifications` rows are server-created (RLS allows any authed actor to INSERT;
owners read/update their own). Emitted:

| Event                       | Type                  | Recipient            |
|-----------------------------|-----------------------|----------------------|
| Reviewer assigned           | `review_assigned`     | the assigned reviewer |
| Decision recorded           | `review_completed`    | the entity's creator  |
| Publication created         | `publication_approved`| the publisher         |
| @mention in a comment       | `comment_mention`     | each mentioned user   |

`listNotifications` / `markNotificationRead` / `markAllNotificationsRead` manage
the per-user inbox.

---

## 8. Module map

- DAL — `apps/web/lib/governance/persistence.ts` (server-only; RLS-aware; `DbResult` with `FORBIDDEN`).
- Report builder — `apps/web/lib/governance/report-builder.ts` (assembles `PublicReportDraft`).
- Actions — `apps/web/app/dashboard/review/actions.ts` (`'use server'` thin wrappers).
- Engine math — `@hsi/research-agents` (`governedConfidence`, `aggregateReviewerValidation`, `computeReviewerTrust`, `applyReviewerVerdictToEvidence`).
- Types — `@hsi/shared-types` (Phase 6 records + view-models).
