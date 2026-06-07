# HSI Methodology

Human Signal Index (HSI) is built on **Interpretable Context Methodology (ICM)**:
no conclusion is ever presented without the chain of evidence and reasoning that
produced it. This document defines the HSI analytical method end to end.

Related: [`RHETORIC-TAXONOMY.md`](RHETORIC-TAXONOMY.md) · [`RISK-SCORING.md`](RISK-SCORING.md)

---

## 1. The 5-stage provenance pipeline

HSI separates knowledge into five distinct, individually-recorded layers. A stage
never runs until the prior layer's artifact exists, and the layers are never
collapsed into one another.

| Stage | Layer | Question answered | Stored as |
| --- | --- | --- | --- |
| 1. **Raw source material** | Source | *What was actually published?* | `evidence_items`, `captures`, `transcripts`, `uploaded_files` |
| 2. **AI extraction** | Extraction | *What specific passages/claims are present?* | `ai_runs`, `ai_trace_passages` |
| 3. **AI interpretation** | Interpretation | *What might these passages mean / which category & risk?* | `classifications`, `risk_scores`, `generated_content` |
| 4. **Human review** | Review | *Is this accurate, fair, and safe to state?* | `reviews` |
| 5. **Public report** | Publication | *What can we responsibly tell the public, with citations?* | `public_reports` |

**Layer rule:** extraction is mechanical (pull what is there); interpretation is
inferential (what it may mean); these are different prompt classes and different
tables. A reviewer can always read the raw passage *next to* the AI's reading of it.

## 2. The traceability engine (sem_debug-style)

The traceability engine (`packages/traceability`) operates like a semantic
debugger: it steps through each analytical claim and resolves it back to the
exact evidence it stands on, the way a debugger resolves a value back to the line
that produced it.

For every claim in an AI output, the engine records:

1. **Claim** — the analytical statement.
2. **Source passage(s)** — the specific spans in `evidence_items`/`transcripts`
   the claim relies on (`ai_trace_passages`).
3. **Confidence** — how strongly the passage supports the claim (0–1).
4. **Verdict** — `supported`, `weakly-supported`, `unsupported`, or `unattributed`.

Claims that fall below `TRACEABILITY_MIN_CONFIDENCE` (**0.72**) or have no source
passage are flagged. Flagged claims **cannot** pass the publish gate without a
reviewer either attaching evidence or removing the claim. There are no
black-box conclusions: every published sentence resolves to a source.

## 3. The 36-category rhetoric taxonomy

Signals are classified using a fixed 36-category taxonomy (seeded in
`category_taxonomy`; full per-category analysis in
[`RHETORIC-TAXONOMY.md`](RHETORIC-TAXONOMY.md)).

1. Extinctionism
2. Antinatalism
3. Efilism
4. Promortalism
5. Negative Utilitarianism
6. Suffering Absolutism
7. AI Suffering Optimization
8. AI Savior Narratives
9. Technocratic Governance
10. Technocratic Moral Control
11. Anti-Human Framing
12. Humanity-as-Plague Rhetoric
13. Consent-to-Birth Framing
14. Hopelessness Amplification
15. Moral Blackmail
16. False Dilemma
17. Trauma Exploitation
18. Dehumanization
19. Reality-Denial Rhetoric
20. Existence-is-Illusion Rhetoric
21. Pain-is-Not-Real Rhetoric
22. Historical Trauma Erasure
23. Population-Reduction Rhetoric
24. Recruitment Language
25. Protest / Activism Language
26. Vulnerable-Audience Targeting
27. Misinformation
28. Disinformation
29. Propaganda
30. Religious Narratives
31. Political Narratives
32. Economic Narratives
33. Civilizational Narratives
34. Technology Narratives
35. Collapse Narratives
36. Doom Narratives

A signal may carry **multiple** categories. Classification describes *the
rhetoric*, never a judgment of any private individual.

## 4. The 5-level risk model

Risk measures the **potential for real-world harm in the framing of the content**,
not the unpopularity of an idea. Full rubric in [`RISK-SCORING.md`](RISK-SCORING.md).

| Level | Name | Definition |
| --- | --- | --- |
| **1** | Philosophical discussion | Abstract, academic, or hypothetical discussion of ideas. No call to act; no target. |
| **2** | Advocacy / persuasion | Actively persuades toward a worldview but remains non-coercive and non-operational. |
| **3** | Mobilization / pressure | Recruitment, guilt/moral pressure, or vulnerable-audience targeting; pushes toward action without explicit harm instructions. |
| **4** | Harm-adjacent / coercive | Normalizes, justifies, or pressures toward harm; coercive framing; erodes the line between idea and action. |
| **5** | Explicit harm encouragement | Explicit encouragement of harm, coercion, or operational danger (instructions, targeting, imminent risk). |

Risk scoring is conservative and evidence-bound: the score is justified by a
neutral explanation tied to a representative (often paraphrased) quote.

## 5. Human-review checkpoints

Human review is mandatory and occurs at defined gates:

| Checkpoint | Reviewer confirms |
| --- | --- |
| After extraction | Quotes/passages are accurately pulled, in context. |
| After classification | Categories fit the rhetoric; no over-reach. |
| After risk scoring | Risk level matches the rubric; explanation is neutral and fair. |
| After traceability audit | Every retained claim is supported ≥ 0.72; flags resolved. |
| Before publication | Safe framing, vulnerable-audience care, no doxxing/defamation, citations present. |

Reviewer actions are recorded in `reviews` and `audit_logs`. See
[`../operating-procedures/REVIEW-QUEUE.md`](../operating-procedures/REVIEW-QUEUE.md).

## 6. Separation of evidence / extraction / interpretation / review

- **Evidence** is immutable raw material with a hash and timestamp (chain of
  custody). It is private by default.
- **Extraction** never editorializes; it only locates and quotes.
- **Interpretation** is clearly labeled as inference and always points to the
  extraction it built on.
- **Review** is a human act with an accountable author and notes.

The UI and data model keep these visually and structurally distinct so a reader
can always tell *what was said* apart from *what HSI thinks it means*.

## 7. Source confidence scoring

Each source carries a `risk_baseline` and a confidence assessment based on:

- **Provenance clarity** — is authorship/origin verifiable?
- **Accessibility** — is the material genuinely public (no login wall)?
- **Stability** — has the source changed/deleted content (`source_changes`)?
- **Corroboration** — is the material independently observable elsewhere?

Source confidence feeds (but does not replace) per-claim traceability confidence.

## 8. The publish-threshold gate

Content may be published **only** when all of the following hold:

1. A `reviews` approval exists for the signal.
2. Every retained public claim has a traceability verdict of `supported` (or
   `weakly-supported` with reviewer-attached evidence) at confidence ≥ **0.72**.
3. No unresolved `unattributed`/`unsupported` flags remain.
4. Safe-framing and vulnerable-audience checks pass (no doxxing, no defamation,
   mental-health-safe language).
5. Only approved, cited material is included; raw private evidence stays private.

If any condition fails, the signal returns to the queue. The gate is enforced
operationally and is the final guard before `public_reports` becomes visible on
`www.humansignalindex.org`.
