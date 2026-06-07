# Risk Scoring — Output

Outputs of the Risk Scoring stage: 1–5 risk levels with neutral, evidence-bound
explanations and recommended actions.

## What lands here

| File / shape | Contents |
| --- | --- |
| `risk-scores-<date>.json` | `signal_id`, `risk_level` (1–5), representative (paraphrased) quote, neutral explanation, `confidence`, `reviewer_status`, `recommended_action`, `ai_run` id + prompt version, reviewer id. |

## Rules

- Risk measures harm in framing, not unpopularity of an idea.
- Explanations stay neutral and non-defamatory; operational detail omitted (esp. 4–5).
- Risk 4–5 must be flagged for escalation.

Example: `risk-scores-2026-06-06.json`.

> Rubric: [`../../../docs/methodology/RISK-SCORING.md`](../../../docs/methodology/RISK-SCORING.md).
