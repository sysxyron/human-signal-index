# Source Review — Signal Triage SOP

> The reviewer standard operating procedure for triaging captured signals.

Captured signals enter at status `new` and are **never** auto-published. A reviewer
(role `reviewer` or above) triages each signal with one of four decisions.

## The four decisions

| Decision | Resulting `hsin_signals.status` | Effect |
|----------|----------------------------------|--------|
| **APPROVE** | `approved` | The signal is validated as a real, relevant public signal. |
| **REJECT** | `rejected` | Noise / out of scope / not a genuine signal. |
| **NEEDS_RESEARCH** | `needs_research` | Worth a full research run — see *Signal → Research*. |
| **ESCALATE** | `reviewing` (+ HIGH `review_escalation` alert) | Needs senior / priority attention. |

Each decision writes an **immutable** `hsin_signal_reviews` row (`reviewer_id =
auth.uid()`, `decision`, `notes`) and a `reviewed` event on the signal's log. This is the
DAL function `reviewSignal(signalId, decision, notes?)`, exposed as
`reviewSignalAction`.

> **Honesty**: the stored decision is the *real* decision. ESCALATE keeps the item
> visible and unresolved (it does not silently approve). REJECT is recorded, not deleted.

## Reviewer SOP

1. Open the signal detail (`getSignalAction`) — read the source, classification,
   confidence, tags, matched watchlists/alerts, version history, and provenance
   (capture jobs + event log).
2. Confirm the source is **public** and the capture is faithful (check the version
   snapshot if in doubt).
3. Decide:
   * Clear, in-scope public signal → **APPROVE**.
   * Noise / duplicate / out of scope → **REJECT** (note why).
   * Significant and warrants deeper analysis → **NEEDS_RESEARCH**, then run
     *Signal → Research*.
   * Sensitive / time-critical / ambiguous → **ESCALATE** with a note.
4. Always leave a `notes` rationale for REJECT / NEEDS_RESEARCH / ESCALATE.

## Escalation

* `reviewSignal(…, 'ESCALATE')` raises a HIGH `review_escalation` alert and leaves the
  signal at `reviewing`.
* `escalateAlertAction(alertId)` sets the alert `escalated` and (best-effort) files a
  `review_queues` row (`entity_type='signal'`, `priority='high'`) so the escalation
  appears in the Phase-6 curation worklist.

## Signal → Research (the key handoff)

`createResearchFromSignalAction(signalId)` (role `researcher`+) is the single auditable
place a signal becomes research:

1. Loads the signal and derives a **concept** from its title + summary + category.
2. Calls `createResearchRun(concept, title)` — runs the multi-agent research engine with
   **automatic** evidence gathering and consensus (Phases 3–5).
3. Links the new run back via `research_runs.origin_signal_id = signalId`.
4. Moves the signal to `reviewing`, records a `research_created` event, and raises a
   MEDIUM `research_created` alert.
5. Returns `{ runId }`.

From there the run flows through the normal **governance** loop (Phase 6): review queue →
decisions → publication. Nothing is published automatically — a curator publishes via the
existing Phase-6 path.
