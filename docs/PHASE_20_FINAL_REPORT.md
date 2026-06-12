# Phase 20 — Collective Intelligence Network, Peer Review & Consensus Engine

**Final Report**

HSI is now a **collaborative intelligence ecosystem**. Multiple researchers work a
single investigation — submitting findings, challenging conclusions, proposing
alternative narratives, debating evidence, and being scored on their reliability —
while a forming **consensus** is computed (weighted, *never* a majority vote) and
routed through **human governance**.

Non-negotiable, enforced end-to-end: **no auto-consensus, no auto-truth, no
auto-publish.** Consensus is a *candidate*; acceptance is always a human decision.

---

## 1. Architecture

Two new pure engines, a collaborative + governed data layer, six dashboards, a
30-minute consensus worker, and one additive migration — layered exactly like
every prior phase.

```
packages/consensus-engine/        (NEW)  weighted consensus + dissent + snapshots
packages/collective-intelligence/ (NEW)  investigations · findings/challenges ·
                                          evidence debate · reputation · governance
        │   (deterministic — `now` injected, no Date.now/Math.random; offline-safe)
        ▼
apps/web/lib/collective/persistence.ts  (DAL, server-only, RLS-scoped, DbResult)
apps/web/lib/collective/view.ts         (client-safe decorators + demo builders)
apps/web/lib/collective/actions.ts      ('use server' wrappers + revalidation)
        │
        ├── dashboard/investigations + /[id]   (board + collaboration detail)
        ├── dashboard/consensus + /[id]         (snapshots + governance decision)
        ├── dashboard/contributors              (reliability leaderboard)
        ├── dashboard/debates                   (evidence under contention)
        └── dashboard/intelligence/operations   (CollectiveHighlightCards strip)
        │
apps/worker/jobs/consensus-worker.ts  (every 30 min; registered)
supabase/migrations/0024_collective_intelligence.sql  (10 tables, RLS, triggers)
packages/shared-types/src/index.ts  (Phase-20 records + view-models + unions)
```

---

## 2. Engines

**`@hsi/consensus-engine`** — weighted consensus. Each finding's WEIGHT blends
evidence quality (0.35), contributor trust (0.30), historical accuracy (0.20), and
governance standing (0.15), then is scaled by **challenge** outcomes (upheld lower
it) and **review** outcomes (approved raise it), Laplace-smoothed. The
highest-weight position is the consensus **candidate**; `computeAgreementScore`,
`computeEvidenceSupport`, `computeConfidenceDistribution`, `computeDissent`, and
`buildConsensusSnapshot` produce a fully explainable snapshot that **always
includes a "not truth / requires human governance" limitation**. Verified by a
test that a strong minority outweighs a weak majority — consensus is *not* a vote.

**`@hsi/collective-intelligence`** — the collaboration layer:
- **Investigation lifecycle** — `DRAFT → ACTIVE → UNDER_REVIEW → CONSENSUS_FORMING
  → PUBLISHED → ARCHIVED` with back-edges; `validateInvestigationTransition` /
  `advanceInvestigation`, audited, reversible.
- **Findings** — `submitFinding`, `submitChallenge` (resolved upheld/rejected,
  never erased), `submitAlternativeNarrative`, `attachEvidence`, `endorseFinding` /
  `withdrawEndorsement` (flagged, never deleted), `calculateDiscussionMetrics`.
- **Evidence debate** — `createEvidenceClaim`, `support/challengeEvidence`,
  `reviewEvidence`, `scoreEvidenceStrength` (explainable: source quality + review +
  contest factors).
- **Reputation** — `computeContributorAccuracy / ReviewReliability /
  ContributionQuality / Trust` → a `ContributorScore` with accuracy, trust, review
  quality, consensus alignment, evidence quality, `explanation[]`, `limitations[]`
  — **no hidden scoring**.
- **Governance** — `approveConsensus / rejectConsensus / escalateConsensus /
  archiveConsensus` (reviewer + reason required; throws otherwise).

---

## 3. Consensus logic

Consensus is a **weighted candidate, not majority vote and not truth**. Agreement =
the leading position's share of total weight; confidence = agreement × evidence ×
sample-factor (thin samples discounted). Dissent is **always computed and shown** —
never discarded. Every snapshot enumerates the weights, the per-position breakdown,
the dissent, the confidence distribution, the explanation, and explicit
limitations. Acceptance requires a human governance decision.

---

## 4. Evidence debate

An evidence claim carries support/challenge counts, review tallies, and source
quality. `scoreEvidenceStrength` is documented and explainable:
`base = 0.5·sourceQuality + 0.5·reviewFactor`, scaled by a contest factor
`support/(support+challenges)` — both Laplace-smoothed — yielding a 0..1 strength
with its explanation and limitations.

---

## 5. Contributor trust

Reputation blends consensus alignment (accuracy), review reliability, contribution
quality, and a base-trust seed, discounted toward neutral for thin samples. Every
score is explainable and advisory — never a verdict on the person. The worker
recomputes scores from each contributor's alignment with the accepted consensus.

---

## 6. Migration 0024

`supabase/migrations/0024_collective_intelligence.sql` (ADD-ONLY). Ten tables:
`hsin_investigations`, `hsin_findings`, `hsin_challenges`, `hsin_alternative_narratives`,
`hsin_endorsements`, `hsin_evidence_claims`, `hsin_evidence_reviews` (append-only),
`hsin_consensus_snapshots` (append-only), `hsin_consensus_reviews` (append-only),
`hsin_contributor_scores`.

RLS via DO-blocks in two tiers: **collaboration** tables (findings, challenges,
alternatives, endorsements, evidence claims) are **researcher+ READ + INSERT**
(contribute) with curator/admin UPDATE/DELETE; **governed/computed** tables
(investigations, evidence reviews, consensus snapshots/reviews, contributor scores)
are **researcher+ READ, curator/admin WRITE**. The `set_updated_at()` trigger is on
the mutable tables; append-only tables carry none. No prior migration is edited.

---

## 7. Dashboard

| Route | Purpose | Components |
|-------|---------|-----------|
| `/dashboard/investigations` | the board | InvestigationBoard (cards), state/agreement badges |
| `/dashboard/investigations/[id]` | collaboration detail | FindingTimeline, ChallengePanel, EvidenceDebatePanel, AlternativeNarrativesPanel, ConsensusCard, DissentTable + submit/challenge/recompute controls |
| `/dashboard/consensus` | snapshot list | agreement + decision badges |
| `/dashboard/consensus/[id]` | consensus + decision | ConsensusCard, ConsensusBreakdown, DissentTable, GovernanceDecisionPanel, decision history |
| `/dashboard/contributors` | leaderboard | ContributorRanking, TrustBreakdown |
| `/dashboard/debates` | evidence under contention | EvidenceDebatePanel, open challenges |
| operations (additive) | cross-surface | CollectiveHighlightCards |

All pages are `force-dynamic`, role-gated, with `NOT_CONFIGURED` → labeled offline
demo. The operations center now shows active investigations, consensus forming,
major disputes, pending governance, high-trust contributors, and high-impact
investigations.

---

## 8. Worker

`consensus-worker.ts`, registered as a 30-minute loop: load active investigations →
recompute + persist consensus snapshots → recompute + upsert contributor scores →
detect disputes (weak agreement / strong dissent) → flag them for **human**
governance review (count only). Fault-isolated, retry-safe, deterministic, and
offline-safe. It **never transitions an investigation, never auto-approves, never
auto-consensus, never auto-publishes** — verified by tests (`autoActed:false`).

---

## 9. Governance guarantees

`autoPublish:false`, `autoApprove:false`, `autoConsensus:false`, `autoTruth:false`
— enforced. Governance decisions (approve/reject/escalate/archive) require a
reviewer + reason (the engine throws otherwise), write an append-only review +
audit log, and move the investigation to the documented resulting state. The DAL
re-checks roles and refuses blank reasons. Consensus snapshots always carry a
"candidate, not truth" limitation.

---

## 10. Testing

- **`@hsi/consensus-engine`** — 48 tests (consensus, weighting, dissent,
  distribution, snapshots, fixtures).
- **`@hsi/collective-intelligence`** — 88 tests (investigation lifecycle, findings,
  evidence, reputation, governance, integration, evidence-deep, fixtures).
- **`consensus-worker`** — 10 tests (offline determinism, snapshot/score compute,
  dispute detection, no-auto-act, fault isolation).
- **collective view helpers** — 21 tests (decorators, formatters, snapshot readers,
  demo builders).
- **Phase 20 net-new: ~167 tests.**

**Full suite: `1629 tests, 1629 pass, 0 fail`.** No Phase 1–19 regressions.

---

## 11. Build & typecheck status

| Gate | Result |
|------|--------|
| `apps/web` `tsc --noEmit` | **0 errors** |
| `apps/worker` `tsc --noEmit` | **0 errors** |
| `packages/consensus-engine` `tsc` | **0 errors** |
| `packages/collective-intelligence` `tsc` | **0 errors** |
| `next build` | **✓ Compiled successfully** — all 6 Phase-20 routes emitted (ƒ) |
| Full test suite | **1629 / 1629 pass** |

> Repo-level `next lint` still fails on the pre-existing ESLint-version
> incompatibility (unrelated to Phase 20); type-checking and the build are clean.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Evidence strength uses stated confidence as an evidence proxy in the snapshot | documented in the DAL; a future pass can wire `scoreEvidenceStrength` per finding |
| Consensus worker re-snapshots each run (append-only growth) | snapshots are cheap + the latest is used; a retention/rollup is a Phase-21 item |
| Contributor scoring uses alignment vs the *current* candidate | candidate may shift; scores are advisory + recomputed each cycle, with limitations shown |
| Reviewer vs curator gating | governance DAL gates at curator (RLS backstop); the engine requires a named reviewer + reason |
| Disputes flagged but not auto-routed | intentional — the worker counts disputes; a human picks them up (no auto-act) |

---

## 13. Deployment steps

1. **Migrate.** Apply `0024_collective_intelligence.sql` (additive; safe after
   0001–0023). Verify the 10 tables + the two-tier RLS + triggers.
2. **Install.** `pnpm install` (links the two new workspace packages — already in
   `apps/web` + `apps/worker` deps and `tsconfig.base.json` paths).
3. **Build.** `pnpm build` (web + worker). Both green.
4. **Test.** `npx tsx --test $(find packages apps -name '*.test.ts' …)` → 1629 pass.
5. **Worker.** Deploy the updated worker; `consensusWorkerJob` runs every 30 min
   under the service-role key (safe offline no-op without it).
6. **Verify.** As a researcher: create an investigation, submit findings, challenge
   one; recompute consensus (curator) and confirm the dissent is shown. As a
   curator: approve/reject the forming consensus and confirm the audit trail +
   resulting state. Check `/dashboard/contributors` shows explainable scores.

---

## 14. Recommended Phase 21 — Cross-Investigation Synthesis & Knowledge Graph

- **Cross-investigation synthesis** — link investigations that bear on the same
  question; compute a higher-order consensus across them with combined provenance.
- **Knowledge graph** — connect findings ↔ evidence ↔ sources ↔ narratives ↔
  publications into a queryable, trust-weighted graph.
- **Reviewer panels & quorum** — multi-reviewer governance with a configurable
  quorum and conflict-of-interest disclosure, still human-decided.
- **Contributor incentives & calibration** — reward calibrated dissent that later
  proves correct; track each contributor's calibration over time.
- **Live consensus deltas** — stream consensus changes (and *why* they changed) so
  reviewers see formation in real time.
- **Federated peer review** — invite external experts into an investigation under
  scoped, audited roles.
```
