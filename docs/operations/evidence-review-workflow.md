# Evidence Review Workflow (WorldForge Phase 5)

How human reviewers (role `reviewer` or `admin`) curate the shared citation library
so that what users see is **honestly** supported.

## The reviewer queue

`listEvidenceReviewQueueAction()` returns `EvidenceReviewQueueItem[]`: each evidence
source with its **latest review verdict**, the distinct runs that link it, and its
**support/contradiction counts**. The queue is prioritized so the riskiest citations
surface first:

1. **Unreviewed** sources (no verdict yet).
2. Sources with the most **contradictions**.
3. Everything else.

## Statuses

Stored verdicts (`evidence_reviews.status`) map to UI labels:

| Stored status | UI label  | Meaning                                                   |
|---------------|-----------|-----------------------------------------------------------|
| `validated`   | Verified  | source checked, genuinely backs (or refutes) the claim.   |
| `rejected`    | Rejected  | source is wrong/irrelevant/low-quality — do not rely on it.|
| `needs_more`  | Disputed  | inconclusive; needs corroboration before trusting.        |
| `pending`     | Pending   | not yet reviewed (the default effective status).          |

A review is recorded with `reviewEvidenceAction(sourceId, status, notes?)`, which
inserts an `evidence_reviews` row stamped with `reviewed_by = auth.uid()`. RLS
authorizes only curators; non-curators are rejected.

## SOP

1. Open the review queue; start at the top (unreviewed + contradicted).
2. Open the source: confirm the title, authors, year, DOI/arXiv id, and that the
   URL resolves to the cited work.
3. Read the claim it is linked to and the engine's `support_type`. Decide whether
   the source genuinely **supports**, **contradicts**, or is merely **background**.
4. Record a verdict:
   - **Verified** (`validated`) — the citation is real and correctly classified.
   - **Disputed** (`needs_more`) — plausible but needs more evidence.
   - **Rejected** (`rejected`) — broken, irrelevant, predatory, or misclassified.
   Always add `notes` for Disputed/Rejected.
5. Re-run evidence for the affected run if the source set changed materially.

## Citation quality rules

- Prefer **peer-reviewed** > review > preprint > encyclopedia > web. The engine's
  `publication_type` drives `reliabilityScore`; reviewers downgrade/reject anything
  mis-tiered.
- A citation must have a **resolvable identifier** (DOI / arXiv id / stable URL).
- Reject **predatory / content-farm** sources outright.
- A `contradicts` link is a feature, not a bug — keep it; it lowers the run's
  evidence-weighted confidence honestly.

## Honesty rules

- **Never invent support.** An `unsupported` claim gets **no** evidence link — the
  engine creates none, and reviewers must not add one to "fill a gap".
- **Contradictions are preserved**, never hidden. They drag confidence down by
  design (see `evidence-weighted-consensus.md`).
- **Tier ceilings are absolute.** No volume of citations raises a fictional or
  physics-violating claim above its ceiling. Do not validate citations as a way to
  bypass that cap.
- Reviewers curate **sources**, not scores: the weighted-consensus math recomputes
  automatically from the (honest) link set.
