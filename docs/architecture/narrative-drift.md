# Narrative Drift

> Detecting when a **public** narrative's framing shifts over time.

A narrative drift is when the *same* narrative (same topic) is **reframed** between two
snapshots — e.g. a movement's stance escalating from "encourage smaller families" to
"urgent depopulation is a moral imperative". It is distinct from a brand-new, unrelated
text (a replacement) and from no-op edits.

## Detection (`detectNarrativeDrift(oldText, newText, now)`)

Pure and deterministic (the caller injects `now`). Returns a `NarrativeDriftEvent` or
`null`:

* **No drift** when `similarity ≥ 0.85` (essentially unchanged), OR when topical overlap
  (token-set Jaccard) `< 0.08` (different topics → a replacement, not a drift).
* Otherwise a drift event with:

| Field | Meaning |
|-------|---------|
| `before` / `after` | The two narrative snapshots. |
| `explanation` | Human-readable: similarity, drift, topical overlap, snippets. |
| `confidence` | `0..1` — higher when clearly changed yet still clearly related (capped 0.95). |
| `driftScore` | `0..1` magnitude = `1 − similarity`. |
| `detectedAt` | The injected `now`. |

`trackNarrative(snapshots[])` runs the detector over an ordered timeline of snapshots,
returning the drift events between each consecutive pair.

## Persistence

* The capture pipeline (`runSourceIntake`) compares the prior signal's body text to the
  new capture and, on a detected drift, writes a `hsin_narrative_drift` row
  (`before_text`, `after_text`, `explanation`, `confidence`, `drift_score`,
  `detected_at`) and raises a **HIGH** `narrative_shift` alert.
* The `driftDetector` worker job does the same in batch over injected candidate snapshot
  pairs (`persistDrift` + a `narrative_shift` alert).

## Narrative timeline

`getSource(id)` returns the source's `narrativeDrift` timeline (newest first) so the UI
can render how a source's framing has evolved. `getIntelligenceOverview()` surfaces the
total `narrativeShifts` count.

## Drift events & alerts

A narrative shift is materially important (it may indicate an evolving campaign or
framing), so it is always flagged **HIGH** and routed for human review. Like every HSIN
alert it is a **draft** carrying an `explanation` — never auto-actioned.
