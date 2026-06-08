# Curator Guide — WorldForge Phase 6

This is the SOP for **curators** (and admins). Curators own the *curation
dashboard*, assign reviewers, **publish** approved entities into versioned
public reports, manage **visibility**, and triage **escalations, low-coverage,
and contradiction** risks.

> You need the **curator** role or above. Publishing, republishing, visibility
> changes, and reviewer assignment are gated by both the app (`FORBIDDEN` below
> curator) and RLS.

---

## 1. The curation dashboard

`getCurationDashboardAction()` → `CurationDashboardData` (best-effort; each block
degrades independently so a partial dashboard still renders):

| Block                  | What it shows                                                           |
|------------------------|-------------------------------------------------------------------------|
| `pendingPublications`  | Recent `publication_records` (newest first).                            |
| `highPriorityReviews`  | `review_queues` with priority `high`/`urgent` that are `under_review`.  |
| `escalations`          | Queue items in `escalated` status awaiting a curator/admin decision.    |
| `contradictionRuns`    | Research runs whose evidence coverage has `contradicted > 0`.           |
| `lowCoverageRuns`      | Research runs with `coverageScore < 50`.                                |

Work the dashboard top-down: clear escalations, then high-priority reviews, then
scrutinize contradiction / low-coverage runs before publishing anything.

---

## 2. Assigning reviewers

`assignReviewerAction(queueId, reviewerId)`:

- Inserts a `review_assignments` row, sets `review_queues.assigned_to`, moves the
  status to `under_review`, and notifies the reviewer (`review_assigned`).
- Re-assignment is just another call — assignment history is append-only.
- Spread load and match expertise; prefer higher-trust reviewers for high-stakes
  or contested items.

---

## 3. Publishing

Publish only **approved**, well-evidenced entities.
`publishEntityAction(entityType, entityId, visibility)`:

1. Builds a frozen `PublicReportDraft` (executive summary, key claims, evidence
   summary, contradictions, consensus + governed confidence, reviewer notes).
2. Creates a `publication_records` row (version 1) **or**, if one already exists
   for that entity, appends the next version and bumps `latest_version`.
3. Stores the snapshot in `publication_versions`.
4. Marks the related `review_queues` entry `published`.
5. Notifies + audits (`entity_published`).

Review the draft first with `buildPublicReportAction(entityType, entityId)` (same
assembly, no write) to preview exactly what will be frozen.

---

## 4. Visibility choices

Pick the tier deliberately — RLS enforces it:

| Tier      | Read access                                  | Use when…                                            |
|-----------|----------------------------------------------|------------------------------------------------------|
| `PRIVATE` | Publisher + curators/admins                  | Draft/internal; not ready for the team.              |
| `TEAM`    | Any authenticated user                       | Shared internally for collaboration/feedback.        |
| `PUBLIC`  | Everyone, including anonymous visitors        | Vetted, finalized, externally shareable.             |

Change later with `updatePublicationVisibilityAction(id, visibility)` (audited).
Default to the *least* exposure that fits, and only promote to `PUBLIC` once the
report is fully vetted (no unresolved contradictions/escalations).

---

## 5. Versioning + republish

Publications are **immutable per version**. When the underlying run changes
(more evidence, new reviews, a corrected contradiction), re-publish to capture
the new state:

- `republishEntityAction(publicationId)` re-runs the report builder and appends
  the next `publication_versions` snapshot, bumping `latest_version`. Prior
  versions are retained for history/audit.
- `getPublicationAction(id)` returns the record + all versions (ascending) for the
  history view; compare any two `snapshot_json` payloads (governed confidence,
  evidence counts, key claims, contradictions) to see what changed between
  publications.

Re-publish (rather than edit) whenever the public story should change — the
version history is the provenance.

---

## 6. Handling escalations, low coverage, and contradictions

- **Escalations.** Items in `escalated` are surfaced and stay visible until you
  act. Read the reviewer notes, re-assign or record your own decision
  (`submitReviewDecisionAction`), and resolve to `approved`/`rejected`/
  `needs_evidence`. Never publish an escalated item without resolving it first.
- **Contradictions (`contradicted > 0`).** Do **not** publish as `PUBLIC` while
  unresolved. Send back as `NEEDS_EVIDENCE` for reconciliation, or publish at
  `PRIVATE`/`TEAM` with the contradictions clearly surfaced (the report's
  `contradictions` array carries them — honesty over polish).
- **Low coverage (`coverageScore < 50`).** Treat the confidence as soft. Prefer
  `NEEDS_EVIDENCE` to drive more evidence gathering (Phase 4/5) before publishing.

---

## 7. Quick reference (actions)

- `getCurationDashboardAction()` — the dashboard.
- `assignReviewerAction(queueId, reviewerId)` — assign.
- `buildPublicReportAction(entityType, entityId)` — preview the draft (no write).
- `publishEntityAction(entityType, entityId, visibility)` — publish / new version.
- `republishEntityAction(publicationId)` — append a fresh snapshot version.
- `updatePublicationVisibilityAction(id, visibility)` — change tier.
- `listPublicationsAction()` / `getPublicationAction(id)` — browse + history.
- `getAuditTrailAction(entityType, entityId)` — full action history.
