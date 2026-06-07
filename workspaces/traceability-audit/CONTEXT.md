# Traceability Audit — ICM Context

> ICM workspace. **Stage 6** of the HSI pipeline. The provenance guardian.

## Purpose

Verify that every AI-generated claim maps to a specific source passage, compute
per-claim confidence, and flag unsupported or unattributed statements. This stage
operates the publish gate: nothing below `TRACEABILITY_MIN_CONFIDENCE` (**0.72**)
may be published without reviewer-attached evidence.

## Inputs

| Input | Source / table |
| --- | --- |
| AI summaries / claims | `ai_runs`, `generated_content` |
| Source evidence / passages | `evidence_items`, `transcripts`, `ai_trace_passages` |
| Classification metadata | `classifications`, `risk_scores` |

Writes/uses: `ai_trace_passages` (claim↔passage mappings + confidence).

## Steps (AI + human)

1. **Engine (sem_debug-style):** for each claim, resolve the source passage(s) it
   relies on and compute support confidence (0–1).
2. **Engine:** assign a verdict — `supported`, `weakly-supported`, `unsupported`,
   or `unattributed` — against the 0.72 threshold.
3. **Human:** resolve flags (attach evidence or remove the claim).

## Human-review checkpoint

A reviewer confirms every retained public claim is `supported` (or
`weakly-supported` with attached evidence) at ≥ 0.72 and that no `unsupported` /
`unattributed` flags remain. This is the **publish gate**. Logged in `reviews` /
`audit_logs`.

## Outputs (`./output/`)

- Traceability reports (per claim: passage, confidence, verdict).
- Unsupported/unattributed claim flags.
- Provenance mappings (claim → source passage).

## Required provenance metadata

`signal_id`, claim id, mapped `ai_trace_passages` references, per-claim confidence,
verdict, threshold used (0.72), overall traceability score, reviewer resolution.

> An example report is provided in [`./output/example-trace-report.md`](./output/example-trace-report.md).
