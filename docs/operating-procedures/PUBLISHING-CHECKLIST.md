# HSI Public-Report Publishing Checklist

Every public report must clear this checklist before it goes live on
`www.humansignalindex.org`. The **traceability gate** is mandatory and
non-negotiable. Completing this checklist is logged in `audit_logs`.

Methodology: [`../methodology/README.md`](../methodology/README.md) §8.
Review flow: [`REVIEW-QUEUE.md`](REVIEW-QUEUE.md).

---

## 1. Provenance & traceability gate (mandatory)

- [ ] Every public claim links to source passages (`ai_trace_passages`).
- [ ] Traceability confidence ≥ `TRACEABILITY_MIN_CONFIDENCE` (**0.72**) for all
      retained public claims.
- [ ] No unresolved `unsupported` or `unattributed` flags remain.
- [ ] Raw source, AI extraction, AI interpretation, and human review are kept
      distinct in the report (interpretation labeled as inference).
- [ ] Source confidence is shown.

## 2. Human review

- [ ] A `reviews` approval exists for this signal.
- [ ] Classification (36-category) confirmed; no over-reach.
- [ ] Risk level (1–5) confirmed against the rubric.
- [ ] Reviewer is named/accountable; notes recorded.

## 3. Safe-framing & ethics

- [ ] Argues against ideas, not any private individual.
- [ ] No private personal data (no doxxing).
- [ ] No mob incitement; no call to target anyone.
- [ ] Mental-health-safe framing; no operational/harmful detail.
- [ ] Vulnerable-audience care applied (especially risk 3–5).
- [ ] Language is neutral and non-defamatory.

## 4. Public-education structure

- [ ] What the rhetoric **says**.
- [ ] What it **assumes**.
- [ ] What it **leaves out**.
- [ ] **Who may be vulnerable**.
- [ ] **How to respond safely** + debate questions.
- [ ] Relevant context (historical / AI-ethics / biology-cosmos) where useful.

## 5. Citations & evidence boundary

- [ ] All cited sources are public and verifiable.
- [ ] Only the specific evidence needed to support claims is surfaced.
- [ ] Raw private evidence remains in the private vault (not published in bulk).
- [ ] Public assets live only in `public-report-assets`.

## 6. Publish & record

- [ ] Report saved to `public_reports`; assets in `public-report-assets`.
- [ ] Publish action logged in `audit_logs` (actor, signal, timestamp).
- [ ] Correction/takedown contact is reachable from the public page.

> If **any** item fails, return the signal to the Review Queue. The gate exists to
> guarantee HSI publishes nothing it cannot stand behind, trace, and defend.
