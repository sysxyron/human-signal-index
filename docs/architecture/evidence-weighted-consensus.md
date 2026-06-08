# Evidence-Weighted Consensus (WorldForge Phase 5)

Research agents produce a **Research Confidence** (0..100) from reasoning + debate.
Phase 5 weighs that against the **evidence actually gathered** to produce an
**Evidence-Weighted Confidence** — and explains *why the score changed*.

Three distinct quantities:

| Quantity                        | Source                                                       |
|---------------------------------|--------------------------------------------------------------|
| **Research Confidence**         | agent/consensus output (`report.overallConfidence`). Input.  |
| **Evidence Confidence**         | derived purely from the evidence statistics (below).         |
| **Evidence-Weighted Confidence**| blend of the two + support bonus − contradiction drag.       |

All computed by `evidenceWeightedConsensus(researchConfidence, evidence)` in
`@hsi/research-agents`. Per-claim verdicts come from `computeClaimReliabilities(...)`.

## Formulas

Ratios (per run, over `totalClaims`):

```
supportRatio        = supported     / totalClaims
contradictionRatio  = contradicted  / totalClaims
unsupportedRatio    = unsupported   / totalClaims
```

### Evidence Confidence (0..100)

```
evidenceConfidence = 100 * clamp(
      0.7  * supportRatio
    + 0.3  * (coverageScore / 100)
    - 1.1  * contradictionRatio
    - 0.55 * unsupportedRatio,
    0, 1)
```

Support and coverage are the only positive terms (max 0.7 + 0.3 = 1.0).
Contradictions are penalized ~2× harder than mere absence of evidence.

### Evidence-Weighted Confidence (0..100)

```
base               = 0.5 * researchConfidence + 0.5 * evidenceConfidence
supportBonus       = 12 * supportRatio * (coverageScore / 100)     // up to +12
contradictionDrag  = 25 * contradictionRatio                        // up to −25

evidenceWeightedConfidence = clamp(base + supportBonus - contradictionDrag, 0, 100)
delta = evidenceWeightedConfidence - researchConfidence
```

Strong, well-covered, multi-source support pushes the score **up** beyond the plain
mean; any contradiction drags it **down** and always wins ties against support.

### Claim reliability tier ceilings

`computeClaimReliability` blends the claim's own confidence with the evidence
confidence, modulates by coverage (supported ×1.15 +per-source lift; contradicted
×0.4; unsupported capped at 0.45; background neutral), then applies the **HONESTY
ceiling** — evidence can never push a claim above its scientific tier ceiling:

| Tier                     | Ceiling |
|--------------------------|---------|
| known-science            | 1.00    |
| plausible-science        | 0.85    |
| speculative              | 0.55    |
| fictional                | 0.18    |
| violates-known-physics   | 0.08    |

So no amount of citation can launder fiction or a physics violation into "reliable".

## Worked examples

### 1) High research, all unsupported → score goes DOWN

Research Confidence = **90**, 5 claims, all `unsupported`, coverageScore = 0:

```
supportRatio = 0, contradictionRatio = 0, unsupportedRatio = 1.0
evidenceConfidence = 100 * clamp(0 + 0 - 0 - 0.55*1.0, 0, 1) = 0
base = 0.5*90 + 0.5*0 = 45
supportBonus = 0,  contradictionDrag = 0
evidenceWeighted = clamp(45, 0,100) = 45   → delta = -45  (DOWN)
```

Explanation headline: *"Confidence decreased from 90 → 45"*, plus "5 unsupported
claims (no evidence found)" and "low evidence coverage (0/100)".

### 2) Mid research, 6 supported / coverage high → score goes UP

Research Confidence = **72**, 6 claims supported, coverageScore = 100:

```
supportRatio = 1.0, contradictionRatio = 0, unsupportedRatio = 0
evidenceConfidence = 100 * clamp(0.7*1 + 0.3*1, 0,1) = 100
base = 0.5*72 + 0.5*100 = 86
supportBonus = 12 * 1.0 * 1.0 = 12,  contradictionDrag = 0
evidenceWeighted = clamp(86 + 12, 0,100) = 98 → delta = +26  (UP)
```

Explanation headline: *"Confidence increased from 72 → 98"*, plus "strong support
from 6 sources (lifts confidence)" and "evidence coverage 100/100".

## "Why the score changed" explanations

`evidenceWeightedConsensus` returns an `explanation: string[]` whose first entry is
the headline (`increased`/`decreased`/`unchanged`, with the before→after numbers),
followed by the active drivers: contradictions, low coverage, unsupported claims,
strong/partial support. `applyEvidenceToConsensus(report, evidence)` appends these
to the report's `blueprintNotes`. The DAL stores them in
`research_runs.evidence_coverage.explanation` so the UI can render the rationale
verbatim.

## Persistence

- `research_runs.evidence_weighted_confidence` ← `evidenceWeightedConfidence`
- `research_runs.support_ratio` / `contradiction_ratio` / `unsupported_ratio`
- `research_runs.evidence_coverage` jsonb is **extended** with
  `{ evidenceWeightedConfidence, researchConfidence, explanation, claimReliabilities }`.
