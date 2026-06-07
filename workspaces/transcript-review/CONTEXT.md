# Transcript Review — ICM Context

> ICM workspace. **Stage 3** of the HSI pipeline (when audio/video is present).

## Purpose

Validate transcript accuracy against the captured source and extract verified
quotes for downstream extraction. Ensures the words analyzed are the words
actually spoken/published.

## Inputs

| Input | Source / table |
| --- | --- |
| Raw transcripts | `transcripts`, contributor-supplied |
| Video/audio metadata | `evidence_items`, `captures` |
| Source attribution | `signals`, `sources` |

Writes/updates: `transcripts` (reviewed text, corrections, quote extracts).

## Steps (AI + human)

1. **AI assist:** produce/normalize a draft transcript with timecodes; flag
   low-confidence segments. Logged as `ai_runs`.
2. **Human:** verify the transcript against the source, correct errors, and mark
   approved quote extracts (with timecodes + speaker/source attribution).
3. **System:** store reviewed text + corrections in `transcripts`.

## Human-review checkpoint

A reviewer signs off that the transcript is accurate and quotes are faithful and
in-context. This is a **required human verification** before extraction. Logged in
`reviews` / `audit_logs`.

## Outputs (`./output/`)

- Reviewed transcript text.
- Approved quote extracts (with timecodes + attribution).
- Reviewer corrections log.

## Required provenance metadata

`signal_id`, `transcript_id`, source/evidence reference, `ai_run` id, reviewer id,
correction record, timecodes for each extracted quote.
