# Signal Intake — ICM Context

> Interpretable Context Methodology (ICM) workspace. **Stage 1** of the HSI pipeline.

## Purpose

Collect and normalize public signal submissions from researchers, journalists, and
verified contributors. This stage opens a signal's record and begins its
chain-of-custody. It captures **what** is being submitted and **where it came
from** — never private data, never login-walled content.

## Inputs

| Input | Source / table |
| --- | --- |
| Manual text submissions | Dashboard intake form |
| URL submissions | Contributors / connectors |
| Public social pages | Public URLs only |
| Uploaded video/audio | `uploaded_files` (private bucket, signed URL) |
| Uploaded screenshots | `uploaded_files` |
| Transcripts | Contributor-supplied |
| Source attribution metadata | Form fields → `sources`, `tags` |

Writes: `signals` (status `intake`), `uploaded_files`. References: `sources`, `tags`.

## Steps (AI + human)

1. **AI assist:** normalize the submission — detect type, deduplicate, draft a
   candidate title/summary, propose tags. Logged as an `ai_runs` entry.
2. **AI assist:** validate the material appears genuinely public; flag anything
   login-walled or private for rejection.
3. **System:** create the `signals` row with source attribution, status `intake`.

## Human-review checkpoint

A reviewer confirms the source is genuinely public, attribution is accurate, no
private data is present, and the signal is in scope. Accept → advance to Source
Capture; reject → logged reason. Recorded in `reviews` / `audit_logs`.

## Outputs (`./output/`)

- Normalized signal intake records (JSON).
- Candidate evidence bundles (references, not raw private content).
- Intake summary for review.

## Required provenance metadata

`signal_id`, submission source + attribution, intake timestamp, submitter role,
`ai_run` id for any assist, public-source assertion, initial status.
