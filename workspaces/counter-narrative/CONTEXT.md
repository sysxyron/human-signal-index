# Counter-Narrative — ICM Context

> ICM workspace. **Stage 7** of the HSI pipeline (optional educational layer).

## Purpose

Generate safe, source-backed educational explainers and counter-narratives. The
goal is **media literacy**, not rebuttal-as-attack: explain what a narrative
claims, assumes, and omits, and how to engage with it safely. Always
non-defamatory and mental-health-safe.

## Inputs

| Input | Source / table |
| --- | --- |
| Reviewed classification | `classifications` |
| Risk analysis | `risk_scores` |
| Traceability report | `ai_trace_passages` (verdicts) |

Writes: `generated_content` (drafts, status pending review).

## Steps (AI + human)

1. **AI interpretation:** draft an explainer using the safe-framing structure
   (claims / assumes / leaves out / who is vulnerable / how to respond / debate
   questions / context). Logged as `ai_runs`.
2. **AI:** paraphrase any dangerous/operational text rather than quoting it.
3. **Human:** edit for neutrality, safety, and accuracy; confirm citations.

## Human-review checkpoint

A reviewer confirms the draft is non-defamatory, mental-health-safe, addresses
ideas (not private people), carries citations and traceability, and applies
vulnerable-audience care. Logged in `reviews` / `audit_logs`.

## Outputs (`./output/`)

- Draft counter-narratives / explainers.
- Debate questions.
- Educational summaries (safe-framing structure).

## Required provenance metadata

`signal_id`, `generated_content` id, `ai_run` id, prompt version, source citations,
traceability status, reviewer id, safe-framing checklist result.
