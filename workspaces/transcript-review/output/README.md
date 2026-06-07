# Transcript Review — Output

Outputs of the Transcript Review stage: human-verified transcripts and approved
quote extracts.

## What lands here

| File / shape | Contents |
| --- | --- |
| `transcript-review-<date>.json` | `signal_id`, `transcript_id`, reviewed text, corrections log, `ai_run` id, reviewer id. |
| `quotes-approved.md` | Approved quote extracts with timecodes + speaker/source attribution. |

## Rules

- Quotes must be faithful and in-context; reviewer-verified before downstream use.
- Source/evidence reference and timecodes required for each quote.
- Feeds Rhetoric Classification.

Example: `transcript-review-2026-06-06.json`, `quotes-approved.md`.
