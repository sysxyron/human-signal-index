# Signal Intake — Output

Outputs of the Signal Intake stage. Each artifact references the originating
`signal_id` and carries intake provenance (source, attribution, timestamp,
submitter role, public-source assertion).

## What lands here

| File / shape | Contents |
| --- | --- |
| `signal-intake-<date>.json` | Normalized intake records: `signal_id`, type, draft title/summary, proposed tags, source attribution, `ai_run` id, status `intake`. |
| `signal-intake-summary.md` | Human-readable triage summary for the reviewer. |
| `candidate-evidence-<date>.json` | Evidence **references** (not raw private content) pending capture. |

## Rules

- Public material only; no private data is stored here.
- Raw uploads live in the private `uploads` bucket, not in this folder.
- Nothing here is public; outputs feed Source Capture after review.

Example: `signal-intake-2026-06-06.json`, `signal-intake-summary.md`.
