# Traceability Audit — Output

Outputs of the Traceability Audit stage: claim→passage mappings, per-claim
confidence, and unsupported/unattributed flags. This is the provenance evidence
for the publish gate.

## What lands here

| File / shape | Contents |
| --- | --- |
| `traceability-report-<date>.json` | Per claim: claim text, mapped `ai_trace_passages` reference(s), confidence (0–1), verdict (`supported` / `weakly-supported` / `unsupported` / `unattributed`), threshold (0.72), overall traceability score. |
| `example-trace-report.md` | Worked, neutral example of a traceability report. |

## Rules

- Every public claim must reach a verdict; flags must be resolved before publish.
- Threshold is `TRACEABILITY_MIN_CONFIDENCE` = **0.72**.
- No black-box claims: each statement resolves to a source passage.

Example: `traceability-report-2026-06-06.json`, `example-trace-report.md`.
