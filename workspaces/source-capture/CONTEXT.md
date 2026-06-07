# Source Capture — ICM Context

> ICM workspace. **Stage 2** of the HSI pipeline.

## Purpose

Fetch and preserve public source material for a signal, establishing a verifiable
chain-of-custody (content hash + timestamp). Capture is **public-pages-only**:
no login bypass, no private-group access.

## Inputs

| Input | Source / table |
| --- | --- |
| URLs from Signal Intake | `signals`, `sources` |
| Page metadata | resolved at capture |
| Capture timestamps | system clock at capture |
| RSS / official-API items | `packages/source-connectors` |

Writes: `captures`, `evidence_items`; `evidence` storage bucket (private).

## Steps (AI + human)

1. **System/worker:** fetch the public page via Playwright (or pull RSS/API item);
   store raw text + screenshot in the private `evidence` bucket.
2. **System:** compute a content **hash** and record the **timestamp**, public URL,
   and capturing job — beginning chain-of-custody.
3. **System:** create `captures` + `evidence_items` rows linked to the signal.
4. **AI assist (optional):** detect material type and note if a transcript is needed.

## Human-review checkpoint

A reviewer confirms the capture is complete, the source is public, and
chain-of-custody (hash + timestamp) recorded correctly. Incomplete captures return
to this stage. Logged in `reviews` / `audit_logs`.

## Outputs (`./output/`)

- Raw source captures (private references).
- Screenshot evidence (private).
- Capture metadata + hash digests.

## Required provenance metadata

`signal_id`, `capture_id`, public source URL, capture timestamp, content hash,
capturing connector/job, storage path (private), evidence visibility = private.
