# Reviewer Guide — WorldForge Phase 6

This is the standard operating procedure for **reviewers** (and curators/admins,
who inherit reviewer powers). Reviewers triage the queue, record verdicts, and —
through those verdicts — directly shape each research run's **Governed
Confidence**.

> You need the **reviewer** role or above. The review queue, decisions, and
> assignments are gated by both the app (`FORBIDDEN` below reviewer) and RLS.

---

## 1. Finding work: the queue + assignment

- **The queue.** Reviewers see the *full* `review_queues` list
  (`listReviewQueueAction(filters?)`). Filter by `status`, `priority`,
  `entityType`, assigned reviewer, or date range. Triage by priority
  (`urgent → high → medium → low`) and by risk (runs with contradictions or low
  coverage — see the curation dashboard).
- **Assignment.** A curator/admin assigns you via `assignReviewerAction`, which
  sets `assigned_to`, opens a `review_assignments` row, and sends you a
  `review_assigned` notification. Check your notifications
  (`listNotificationsAction`).
- **Open the item.** `getReviewItemAction(queueId)` returns the queue row, the
  assignment history, all prior decisions, the comment thread, and an
  `entitySummary` — for a research run: overall confidence, governed confidence,
  review status, and evidence support/contradiction/unsupported counts.

Review the **evidence** before deciding: low coverage or any `contradicted`
claims are red flags. Use the comment thread to ask the researcher questions and
`@mention` them.

---

## 2. The four decisions

`submitReviewDecisionAction(queueId, decision, notes?)`. Choose honestly — the
decision is stored immutably and feeds the governance math.

| Decision         | Queue → status   | Meaning                                                        | Validation value |
|------------------|------------------|----------------------------------------------------------------|:----------------:|
| **APPROVE**      | `approved`       | Sound; ready for a curator to publish.                         | 1.0              |
| **REJECT**       | `rejected`       | Not sound; should not be published as-is.                      | 0.0              |
| **NEEDS_EVIDENCE** | `needs_evidence` | Plausible but under-evidenced; gather more, then re-review.    | 0.35             |
| **ESCALATE**     | `escalated`      | Beyond your call (contested, high-stakes, conflict) — kick to a curator/admin. | 0.40 |

**Always write `notes`** for `REJECT`, `NEEDS_EVIDENCE`, and `ESCALATE` (and
ideally `APPROVE`). Notes are captured on the decision, surfaced in the item
detail, and folded into the published report's **Reviewer Notes** section.

Submitting a decision also marks your open `review_assignments` row complete
(`completed_at`).

---

## 3. How your decision affects evidence + governed confidence

Each decision becomes part of a **trust-weighted aggregate** across *all*
decisions on the item:

```
aggregateReviewerValidation(decisions)  →  reviewerValidation ∈ [0,1]
governedConfidence({ researchConfidence, evidenceConfidence,
                     reviewerValidation, reviewerTrust, reviewCount })
  →  research_runs.governed_confidence
```

- The baseline is a 50/50 research+evidence blend. Your verdict is **centered at
  0.5**: an unreviewed item is *not* penalised. `APPROVE` lifts the score,
  `REJECT` drops it; `NEEDS_EVIDENCE`/`ESCALATE` pull mildly down (uncertainty).
- Your **influence scales with your trust** and with how many reviews the item
  received (saturating around ~3 reviews). A single low-trust verdict barely
  moves the number; multiple high-trust, agreeing verdicts move it a lot.
- The run's `governed_confidence` + `review_status` are written immediately, and
  the run's creator gets a `review_completed` notification.

There is also a per-claim hook (`applyReviewerVerdictToEvidence`) that pulls an
individual claim's evidence confidence toward a verdict anchor, trust-weighted —
used when reviewing evidence at the claim level.

---

## 4. Your reviewer trust

Trust (`reviewer_trust.trust_score`, 0..1, default 0.5) is recomputed after every
decision from your `approved / reversed / review` counts:

```
trustScore = clamp01(0.5 + 0.4*(approvalRate - 2*reversalPenalty) + 0.1*activityBonus)
```

- More clean approvals + sustained activity → higher trust.
- **Reversals cost 2×.** A reversal is currently inferred by a *heuristic*: your
  `APPROVE` on an item that ended `rejected`/`escalated`, or your `REJECT` on one
  that ended `approved`/`published`, counts against you. (This is an
  approximation — there is no explicit "overturned" event yet — so an `ESCALATE`
  outcome after your `APPROVE` will register as a reversal. Decide accordingly and
  raise it with curators if it looks wrong.)

Higher trust = more weight on your future verdicts in the governance math.

---

## 5. Escalation handling

Use **ESCALATE** when an item is contested, high-stakes, outside your expertise,
or has a conflict of interest. The item stays `escalated` and **visible** on the
curation dashboard's escalations list — it is never auto-resolved. A curator/admin
then re-reviews, re-assigns, or makes the final call. Leave thorough notes so the
curator has full context.

---

## 6. Quick reference (actions)

- `listReviewQueueAction(filters?)` — your worklist.
- `getReviewItemAction(queueId)` — full detail (queue + assignments + decisions + comments + summary).
- `submitReviewDecisionAction(queueId, decision, notes?)` — record a verdict.
- `listCommentsAction` / `addCommentAction(entityType, entityId, comment, parentId?, mentions?)` — collaborate.
- `listNotificationsAction` / `markNotificationReadAction` / `markAllNotificationsReadAction` — your inbox.
- `getAuditTrailAction(entityType, entityId)` — the full action history.
