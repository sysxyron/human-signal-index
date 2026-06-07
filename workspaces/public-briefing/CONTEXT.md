# Public Briefing — ICM Context

> ICM workspace. **Stage 8** of the HSI pipeline. The publication layer.

## Purpose

Compose public-safe briefings with neutral summaries, source citations, and visible
traceability status. This is the only stage whose output reaches the public, and
only after the full publishing checklist and traceability gate pass.

## Inputs

| Input | Source / table |
| --- | --- |
| Approved signals | `signals`, `reviews` |
| Audit / traceability reports | `ai_trace_passages` |
| Reviewer status | `reviews` |
| Educational explainers | `generated_content` |

Writes: `public_reports`; `public-report-assets` storage bucket (public-read).

## Steps (AI + human)

1. **AI assist:** assemble a neutral briefing from approved, cited material; attach
   citations and traceability status. Logged as `ai_runs`.
2. **Human:** run the publishing checklist (see below); confirm the gate; publish.
3. **System:** write `public_reports`; promote only approved assets to the public
   bucket.

## Human-review checkpoint (publishing gate)

A reviewer confirms ALL of:
- `reviews` approval exists;
- traceability ≥ 0.72 for every public claim; no unresolved flags;
- safe-framing + vulnerable-audience care;
- only approved, cited material (raw evidence stays private);
- correction/takedown contact present.

Logged in `audit_logs`. See
[`../../docs/operating-procedures/PUBLISHING-CHECKLIST.md`](../../docs/operating-procedures/PUBLISHING-CHECKLIST.md).

## Outputs (`./output/`)

- Public briefing documents.
- Citations list.
- Traceability notes / status.

## Required provenance metadata

`signal_id`, `public_report` id, citation list, traceability score + threshold,
reviewer id, publish timestamp, asset references (public bucket only).

> An example briefing is provided in [`./output/example-briefing.md`](./output/example-briefing.md).
