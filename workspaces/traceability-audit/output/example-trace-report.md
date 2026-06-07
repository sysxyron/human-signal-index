# Traceability Report (Example)

> **Sample document.** Illustrative, neutral content for documentation purposes
> only. It demonstrates the report shape, not any real source or person.

| Field | Value |
| --- | --- |
| Signal ID | `sig_example_0001` |
| AI run | `run_example_0007` |
| Prompt version | `extract@1.3`, `interpret@1.1` |
| Threshold | `TRACEABILITY_MIN_CONFIDENCE` = 0.72 |
| Overall score | 0.81 |
| Reviewer | reviewer-example |
| Date | 2026-06-06 |

## Claim-by-claim audit

| # | Claim (AI interpretation) | Source passage (extraction) | Confidence | Verdict |
| --- | --- | --- | --- | --- |
| 1 | The essay frames the choice as voluntary. | "…this is, of course, a personal choice…" — public essay, para. 2 | 0.88 | Supported |
| 2 | The reason given is avoidance of future suffering. | "…to avoid the possibility of future hardship…" — para. 4 | 0.84 | Supported |
| 3 | The essay discourages childbirth generally. | (no passage states a general prescription) | 0.41 | Unsupported |

## Flags

- **Claim 3 — Unsupported (0.41 < 0.72).** No source passage supports a general
  prescription; the source frames a personal choice only.
  **Resolution:** reviewer removed claim 3 from the public briefing. The interpretation
  over-reached beyond what the evidence supports.

## Outcome

- 2 of 3 claims supported above threshold.
- 1 claim removed during human review.
- After resolution, the retained public claims meet the gate; the signal may
  proceed to publication.

> This report is the provenance evidence behind the
> [example public briefing](../../public-briefing/output/example-briefing.md):
> note that the unsupported claim does not appear in the published briefing.
