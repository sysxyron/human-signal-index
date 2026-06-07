# Operating Procedure — Evidence Review

This SOP covers how human reviewers (role `reviewer` or `admin`) validate the
evidence the Phase 4 Evidence & Citation Engine attaches to research runs. The
engine gathers and classifies sources automatically; reviewers provide the human
quality gate on top.

---

## 1. Who can review

Only `reviewer` and `admin` roles may write a review. This is enforced by RLS on
`evidence_reviews` (`is_reviewer_or_admin()`), not just the UI — a non-curator's
insert is rejected at the database. Any authenticated user may *read* review
verdicts (transparency), and a reviewer may always read their own rows.

---

## 2. The review status flow

Each `evidence_reviews` row records a verdict on a single `evidence_sources` row:

```
            ┌──────────────┐
            │   pending    │   (default — awaiting human review)
            └──────┬───────┘
                   │
      ┌────────────┼─────────────┬──────────────────┐
      ▼            ▼             ▼                  ▼
 validated     rejected     needs_more        (re-review)
 (good source) (drop it)    (insufficient,    loops back to
               from use     gather more)      pending/validated
```

| Status       | Meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `pending`    | Not yet reviewed (the implicit starting state).                         |
| `validated`  | The source is real, relevant, and the engine's classification is sound. |
| `rejected`   | The source is wrong, fabricated-looking, irrelevant, or misclassified.  |
| `needs_more` | The claim is under-evidenced; more/better sources are required.         |

Reviews are **append-only** — each review is a new row, so the history is
preserved. The latest row for a source is its current verdict.

---

## 3. Reviewer SOP

For each run flagged for review (typically a public or curated run):

1. **Open the run's evidence surface** and review claim-by-claim. Note the
   run's `evidence_status` (`fixture` means deterministic demo sources, not live
   literature — judge accordingly).
2. **For each linked source**, check:
   - **Existence** — the title/DOI/arXiv id resolves to a real, retrievable work.
   - **Relevance** — the source actually addresses the claim, not just shares
     keywords. A low `relevance_score` near the 0.65 threshold deserves scrutiny.
   - **Stance** — the recorded `support_type` matches the source's real position.
     Pay special attention to `supports` vs `contradicts` mislabels.
   - **Reliability** — the `publication_type` / `reliability_score` is honest
     (a blog should not be tagged `peer-reviewed`).
3. **Record a verdict** via the review control:
   - `validated` when all four checks pass.
   - `rejected` when the source is fabricated, irrelevant, or misclassified — add
     `notes` explaining why.
   - `needs_more` when the claim is under-supported and additional sources are
     needed — add `notes` describing what's missing.
4. **Re-run evidence** if you changed engine config (e.g. flipped to live mode or
   adjusted `EVIDENCE_MIN_RELEVANCE`); the run's links and coverage are rebuilt
   idempotently (the run's existing links are cleared before re-linking).

---

## 4. Citation quality rules

- **No fabrication.** Reject any source whose identifiers do not resolve. The
  engine never invents citations; reviewers must keep it that way.
- **Stance honesty.** A source that contradicts a claim MUST stay tagged
  `contradicts`. Do not "fix" coverage by relabeling a contradiction as support.
- **Relevance over keyword overlap.** A high lexical match is not relevance.
  Reject keyword-coincidence matches.
- **Right tier.** Reliability must reflect the real publication type.
- **Prefer primary, peer-reviewed sources** over preprints, encyclopedias, and
  web pages where they exist for the same claim.

---

## 5. Handling contradicting and unsupported claims

These are **features, not bugs** — the engine is built to surface them honestly.

- **Contradicting evidence (`contradicts`)** — do NOT delete it. A claim with a
  credible contradicting source is a signal the underlying research claim may be
  wrong or overstated. Validate the contradicting source and flag the claim back
  to the research/consensus layer for reconsideration. Lowering the apparent
  conflict by hiding the source is a quality violation.

- **Unsupported claims (no link)** — when a claim has no linked evidence, the
  engine deliberately created **no** link (it never fabricates one). These pull
  the run's `coverageScore` down, which is correct. Mark the claim `needs_more`
  and, where appropriate, escalate to gather live sources (switch to live mode
  and re-run) or to revise the claim. An unsupported speculative claim is
  acceptable *as long as it is clearly labeled as unsupported* — it must not be
  presented as evidence-backed.

---

## 6. Where it lives

- Verdicts: `evidence_reviews` table (migration `0008_evidence_engine.sql`).
- Action: `reviewEvidenceAction(evidenceSourceId, status, notes?)` in
  `apps/web/app/dashboard/worldforge/research/evidence-actions.ts`.
- Re-run evidence: `runEvidenceForRunAction(runId)` in the same file.
