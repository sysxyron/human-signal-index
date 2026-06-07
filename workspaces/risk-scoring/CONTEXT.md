# Risk Scoring — ICM Context

> ICM workspace. **Stage 5** of the HSI pipeline.

## Purpose

Assign a **1–5 risk level** measuring the potential for real-world harm in how
content is framed — not the unpopularity of an idea — and recommend a reviewer
action. Scoring is conservative and evidence-bound.

## Inputs

| Input | Source / table |
| --- | --- |
| Classified rhetoric | `classifications` |
| Source evidence / passages | `evidence_items`, `ai_trace_passages` |
| Reviewer notes | `reviews`, `comments` |

Writes: `risk_scores` (`risk_level`, `quote`, `explanation`, `confidence`,
`reviewer_status`, `recommended_action`); logs `ai_runs`.

## Steps (AI + human)

1. **AI interpretation:** propose a 1–5 level per the rubric, a representative
   (paraphrased/neutral) quote, a neutral explanation, and confidence. Logged as
   `ai_runs`.
2. **AI:** propose a `recommended_action` (catalog / attention / escalate).
3. **Human:** confirm the level against the rubric; ensure the explanation is
   neutral and non-defamatory; set `reviewer_status`.

## Human-review checkpoint

A reviewer confirms the level matches the rubric, the explanation is fair and
neutral, and operational detail is omitted (esp. levels 4–5). Risk 4–5 triggers
escalation. Logged in `reviews` / `audit_logs`.

## Outputs (`./output/`)

- Risk score records (level + confidence).
- Neutral score explanations tied to a representative quote.
- Recommended actions.

## Required provenance metadata

`signal_id`, `risk_score` id, `ai_run` id, prompt version, level, confidence,
supporting passage reference, reviewer id + status.

> Rubric: [`../../docs/methodology/RISK-SCORING.md`](../../docs/methodology/RISK-SCORING.md).
