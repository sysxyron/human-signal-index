# Rhetoric Classification — Output

Outputs of the Rhetoric Classification stage: category labels against the
36-category taxonomy, each tied to a supporting passage.

## What lands here

| File / shape | Contents |
| --- | --- |
| `classification-results-<date>.json` | `signal_id`, categories (slug + title), classifier confidence per label, supporting `ai_trace_passages` reference, `ai_run` id + prompt version, reviewer adjustments. |

## Rules

- Labels describe rhetoric, not private people.
- Multiple categories allowed; each must reference supporting evidence.
- Reviewer-confirmed before risk scoring.

Example: `classification-results-2026-06-06.json`.

> Taxonomy: [`../../../docs/methodology/RHETORIC-TAXONOMY.md`](../../../docs/methodology/RHETORIC-TAXONOMY.md).
