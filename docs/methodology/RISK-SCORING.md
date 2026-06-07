# HSI Risk Scoring Model

HSI assigns each signal a risk level from **1 to 5**. Risk measures the
**potential for real-world harm in how content is framed and aimed** — not the
unpopularity, strangeness, or controversy of an idea. Unpopular philosophy is low
risk; coercive, operational, or targeting content is high risk.

Risk scores are stored in `risk_scores` with: `risk_level`, a representative
`quote` (neutral / paraphrased), a neutral `explanation`, a `confidence` value, a
`reviewer_status`, and a `recommended_action`.

---

## 1. The five levels

### Level 1 — Philosophical discussion
Abstract, academic, or hypothetical discussion of ideas. No call to act, no target,
no operational content. Example posture: "Some philosophers argue X."
- **Recommended action:** Catalog. Standard public-education framing.

### Level 2 — Advocacy / persuasion
Actively persuades toward a worldview but stays non-coercive and non-operational.
Strong opinion, not pressure or instruction.
- **Recommended action:** Catalog with media-literacy framing (claims/assumes/omits).

### Level 3 — Mobilization / pressure
Recruitment language, guilt-based moral pressure, false-dilemma framing, or
vulnerable-audience targeting. Pushes toward action without explicit harm
instructions.
- **Recommended action:** Reviewer attention; add vulnerable-audience care and safe
  framing; consider escalation if targeting is present.

### Level 4 — Harm-adjacent / coercive
Normalizes, justifies, or pressures toward harm; coercive framing; erodes the line
between an idea and acting on it (without yet giving explicit operational detail).
- **Recommended action:** Escalate to senior reviewer; mark sensitive; restrict
  framing; never amplify; route to Security & Alerts if directed at people.

### Level 5 — Explicit harm encouragement / coercive / operational danger
Explicit encouragement of harm, coercion, or operational danger — instructions,
targeting of identifiable people, or imminent-risk content.
- **Recommended action:** Immediate escalation; **do not publish operational
  detail**; preserve evidence with chain-of-custody; follow incident runbook;
  consider appropriate external referral per policy.

---

## 2. Scoring rubric

| Signal | L1 | L2 | L3 | L4 | L5 |
| --- | --- | --- | --- | --- | --- |
| Calls the audience to act | No | No | Yes (soft) | Yes | Yes (explicit) |
| Coercion / guilt pressure | No | Mild | Yes | Strong | Extreme |
| Targets identifiable people | No | No | No | Possible | Yes |
| Operational / instructional | No | No | No | Edging | Yes |
| Vulnerable-audience targeting | No | No | Possible | Likely | Yes |

When indicators span levels, **assign the highest level any indicator reaches**,
then justify in the explanation.

## 3. Confidence and the publish gate

- Each score carries a `confidence` (0–1).
- Public reporting of analytical claims requires traceability confidence ≥
  `TRACEABILITY_MIN_CONFIDENCE` (**0.72**) — see
  [`README.md`](README.md) §8.
- A high risk level never bypasses the human-review checkpoint; if anything,
  higher risk demands *more* scrutiny and more conservative publication.

## 4. Framing rules for explanations

1. Describe the **rhetoric**, never diagnose a private person.
2. Use neutral, non-defamatory language ("the framing presents…", not "this evil…").
3. Tie the level to a representative quote — paraphrase to avoid amplifying harm.
4. State *why* the level was chosen against the rubric.
5. For Level 4–5, omit operational specifics from any public-facing text.

**Example (neutral):** *"Risk Level 1. The passage discusses extinction as a
philosophical position without any call to action or reference to identifiable
individuals; categorized under extinctionism. No coercive or operational language
observed in this sample."*
