# Rhetoric Classification — ICM Context

> ICM workspace. **Stage 4** of the HSI pipeline.

## Purpose

Classify a signal against the HSI **36-category rhetoric taxonomy**, describing the
*rhetoric* (not any private person). Classification is the first analytical step,
not a verdict.

## Inputs

| Input | Source / table |
| --- | --- |
| Reviewed transcripts | `transcripts` |
| Source text / evidence | `evidence_items`, `captures` |
| Extracted passages | `ai_trace_passages` |
| Taxonomy | `category_taxonomy` (36 categories) |

Writes: `classifications` (category + score); logs `ai_runs`.

## Steps (AI + human)

1. **AI extraction** (separate prompt class) locates candidate passages.
2. **AI interpretation:** propose categories from the 36-taxonomy with classifier
   confidence and a passage reference for each. Logged as `ai_runs`.
3. **Human:** confirm/adjust categories; remove over-reaching labels.

## Human-review checkpoint

A reviewer confirms the categories fit the rhetoric, are evidence-linked, and do
not over-reach. Multiple categories allowed. Logged in `reviews` / `audit_logs`.

## Outputs (`./output/`)

- Category labels per signal.
- Taxonomy metadata (slug, title) per label.
- Classifier confidence scores + supporting passage references.

## Required provenance metadata

`signal_id`, `ai_run` id, prompt version, each category + confidence + supporting
`ai_trace_passages` reference, reviewer adjustments, reviewer id.

> See [`../../docs/methodology/RHETORIC-TAXONOMY.md`](../../docs/methodology/RHETORIC-TAXONOMY.md)
> for the full category definitions.
