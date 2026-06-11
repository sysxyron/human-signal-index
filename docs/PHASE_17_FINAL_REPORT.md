# Phase 17 — Public Trust, Recalibration & Intelligence Governance

**Final Report**

HSI now does more than *measure* trust (Phase 16). It tracks how trust **evolves**,
detects **drift**, **recommends** recalibration, routes that recommendation through
**governance**, attaches trust **provenance** to intelligence, and surfaces trust
**publicly** — while never auto-applying a trust change and always keeping a human
in control.

Every trust score is **explainable, auditable, reproducible, governed, and
historically traceable**. No black-box trust. No automatic trust changes.

---

## 1. Architecture

Phase 17 extends Phase 16 (calibration & trust, migration 0020) with two new pure
engines, a governance-driven data layer, five dashboards, a worker stage, and one
additive migration. The layering mirrors every prior phase: **pure deterministic
engine → server-only DAL → server actions → server components → client controls**.

```
packages/trust-history/        (NEW)  pure engine — history, trend, drift, provenance
packages/recalibration-engine/ (NEW)  pure engine — proposals + governance workflow
        │
        ▼  (offline-safe, deterministic — `now` injected, no Date.now/Math.random)
apps/web/lib/trust/persistence.ts  (DAL, server-only, RLS-scoped, DbResult, never throws)
apps/web/lib/trust/view.ts         (client-safe decorators/formatters + demo builders)
apps/web/lib/trust/actions.ts      ('use server' thin wrappers + revalidation)
        │
        ├── app/dashboard/trust/history     (TrustHistoryChart, trend, drift, provenance)
        ├── app/dashboard/trust/public       (TrustBreakdownPanel + TrustProvenancePanel)
        ├── app/dashboard/trust/proposals     (queue) + /proposals/[id] (review + decide)
        ├── app/dashboard/trust/drift         (TrustDriftTimeline + breakdowns)
        └── operations  (TrustGovernanceHighlightCards — cross-surface entry point)
        │
apps/worker/jobs/trust-monitor.ts  (Trust Monitoring Stage; hooked into outcome-alert-worker)
supabase/migrations/0021_trust_history_and_governance.sql  (6 tables, RLS, triggers, indexes)
packages/shared-types/src/index.ts  (Phase-17 records + view-models + unions)
```

### Design principles (binding, inherited from Phases 1–16)

- **Pure & deterministic** — callers inject `now`; no `Date.now()` / `Math.random()`.
  Same inputs → identical outputs (verified by `deterministic across runs` tests).
- **Append-only history** — a trust snapshot is added, never overwritten.
- **Proposal-only recalibration** — recommendations never mutate trust/confidence.
  Only an explicit human approval produces a new state; the previous state is always
  preserved (reversible) and audited.
- **Explainable, never black-box** — every score enumerates its factors (value ×
  weight = contribution), the documented weights, and explicit limitations.
- **Offline-safe** — empty env degrades to labeled fixtures; `next build` passes.
- **Backward-compatible** — additive only; no Phase 1–16 migration, table, policy,
  or engine is modified (one additive `ALTER` extends an existing `CHECK`).

---

## 2. Core capabilities delivered

| # | Capability | Where |
|---|-----------|-------|
| 1 | **Trust History Engine** — `recordTrustSnapshot`, `getTrustHistory`, `computeTrustTrend`, `detectTrustDrift`; improving / stable / degrading / volatile classification; append-only | `packages/trust-history/{history,trend}.ts` |
| 2 | **Trust Drift Detection** — `detectTrustDrift` → `TrustDriftEvent` with severity/reason/evidence/recommendation (collapse, degradation, instability, over-/under-confidence); no auto-correction | `packages/trust-history/drift.ts` |
| 3 | **Recalibration Recommendation Engine** — `proposeRecalibration`, `proposalFromDriftEvent`, `proposalFromCalibrationError` → `RecalibrationProposal` (proposal only) | `packages/recalibration-engine/propose.ts` |
| 4 | **Governance Approval Workflow** — `reviewRecalibrationProposal`, `approveProposal`, `rejectProposal`, `reverseDecision`; audit trail, previous state preserved, fully reversible | `packages/recalibration-engine/governance.ts` |
| 5 | **Public Trust Surface** — `/dashboard/trust/public`: trust score, reliability, calibration quality, outcome accuracy, evidence quality, governance history + provenance | `app/dashboard/trust/public` |
| 6 | **Trust Provenance** — `buildTrustProvenance` → `TrustExplanation` (factors/weights/limitations/history); `TrustProvenancePanel` reused across history/public/operations | `packages/trust-history/provenance.ts`, `components/trust/TrustProvenancePanel.tsx` |
| 7 | **Trust Trend Dashboards** — `/dashboard/trust/history`: `TrustHistoryChart`, drift timeline, trend panel, ranking table | `app/dashboard/trust/history` |
| 8 | **Trust Alerting** — `trust_degrading`, `trust_collapse`, `trust_instability`, `recalibration_required`, `trust_override_applied` → `hsin_decision_alerts` (never auto-resolved) | migration 0021 + worker |
| 9 | **Trust Publication Integration** — `publishTrust` attaches confidence + calibrated reliability + trust score + provenance to `hsin_trust_publications` (research/evidence/decision/forecast/simulation) | DAL `publishTrust` / action |
| 10 | **Database Migration 0021** — 6 tables, indexes, FKs, RLS, `updated_at` trigger, alert-type extension | `supabase/migrations/0021_*.sql` |

---

## 3. Migrations

`supabase/migrations/0021_trust_history_and_governance.sql` (ADD-ONLY).

**Tables**

| Table | Shape | Mutability |
|-------|-------|------------|
| `hsin_trust_history` | append-only trust snapshots (entity, score, confidence, calibration, band, `snapshot_at`) | append-only |
| `hsin_trust_drift` | drift events (kind, severity, magnitude, current/baseline, evidence, recommendation) | append-only |
| `hsin_recalibration_proposals` | proposals (trigger, current/recommended confidence, direction, severity, status) | **mutable** (status) |
| `hsin_recalibration_reviews` | governance decisions (decision, reason, previous→new state, reversible, audit trail) | append-only |
| `hsin_trust_overrides` | applied trust changes (previous→new score/band, reason, who, reversible) | append-only |
| `hsin_trust_publications` | trust attached to reports (confidence, calibrated reliability, trust score, provenance) | append-only |

**Conventions honored:** `hsin_` prefix; `gen_random_uuid()` PKs; `created_at` default
`now()`; `CHECK`-guarded enum/range columns; FKs to `public.users(id) on delete set
null` and to `hsin_recalibration_proposals(id)`. `entity_id` is a **polymorphic text
reference** (indexed via `(entity_type, entity_id)`), matching the Phase-16 trust-entity
model. The shared `public.set_updated_at()` trigger is attached to the **one** mutable
table only. RLS is enabled on all six with the canonical shape: **researcher+ read
(`is_researcher_or_above`), curator/admin write (`is_curator_or_admin`), admin all
(`is_admin`)**. The service-role worker bypasses RLS.

**Alert-type extension:** the `hsin_decision_alerts_alert_type_check` constraint (last
set by 0020) is dropped and re-added with the full set — six Phase-15 + four Phase-16
(incl. `trust_collapse`) + four **new** Phase-17 types: `trust_degrading`,
`trust_instability`, `recalibration_required`, `trust_override_applied`. No prior
migration is edited.

---

## 4. Workers

**Trust Monitoring Stage** — `apps/worker/jobs/trust-monitor.ts`, exported as
`runTrustMonitoringStage(now, { client? })` and hooked into the existing
`outcome-alert-worker` as **Stage 5** (fault-isolated `try/catch`; a failure logs and
the worker continues).

Steps, each fault-isolated:

1. **History** — append one immutable `hsin_trust_history` snapshot per Phase-16 trust
   row (append-only).
2. **Drift** — for entities with ≥2 snapshots, run `detectTrustDrift` + `computeTrustTrend`;
   persist non-stable events to `hsin_trust_drift`.
3. **Proposals** — for actionable drift, raise a `RecalibrationProposal`
   (`proposalFromDriftEvent`) into `hsin_recalibration_proposals` (status `pending` —
   never applied).
4. **Alerts** — raise the four advisory alert types into `hsin_decision_alerts`
   (status `open`, never auto-resolved).

**Guarantees:** deterministic (`now` = `ctx.runAt`), retry-safe (append-only, no
destructive writes), offline-safe (no service-role env → runs `@hsi/trust-history`
fixtures, logs, persists nothing), and **never auto-acts** (`autoApplied:false`,
`autoResolved:false` logged). The worker summary now carries a `trustMonitor` block.

---

## 5. Dashboards

| Route | Purpose | Key components |
|-------|---------|----------------|
| `/dashboard/trust/history` | trust over time + per-entity drill-in | `TrustHistoryChart`, `TrustHistoryRankingTable`, `Sparkline`, `TrustDriftTimeline`, `TrustProvenancePanel`, trend panel, `RecordHistoryButton` |
| `/dashboard/trust/public` | transparent public trust surface | `TrustBreakdownPanel`, `TrustProvenancePanel`, `TrustScoreRing`, band/trend badges |
| `/dashboard/trust/proposals` | recalibration queue (status-filtered) | proposal cards, status/severity badges, counts |
| `/dashboard/trust/proposals/[id]` | review + decide one proposal | review checklist, decision history, `RecalibrationDecisionControl` (approve/reject) |
| `/dashboard/trust/drift` | drift timeline + severity/kind breakdowns | `TrustDriftTimeline` |
| `operations` (additive) | cross-surface entry point | `TrustGovernanceHighlightCards` |

All pages are `force-dynamic` server components, role-gated (researcher+ view,
curator+ act), with `NOT_CONFIGURED` → labeled offline demo from the engine fixtures,
and `EmptyState` / `ErrorState` / `OfflineDemoBanner` states. Navigation via
`TrustGovernanceNav`.

---

## 6. Governance

- **Drift only recommends.** `TrustDriftEvent` carries an advisory `recommendation`;
  nothing changes a score.
- **Recalibration is a proposal.** `proposeRecalibration` produces a `pending`
  proposal; the engine never mutates state.
- **Decisions are human + audited.** `approveProposal` / `rejectProposal` require a
  non-blank reviewer **and** reason (throws `RecalibrationDecisionError` otherwise).
  Approval records `previousState`, `newState`, an append-only `auditTrail`, and
  `reversible:true`. Rejection leaves state unchanged (`newState == previousState`).
- **Applied changes are reversible + traced.** A DAL approval writes a
  `hsin_trust_overrides` row (previous→new) and raises a `trust_override_applied`
  alert; `reverseDecision` restores the prior state with an audit note.
- **DAL enforcement.** `decideRecalibrationProposal` re-checks curator role, refuses a
  blank reason, refuses re-deciding a non-pending proposal, and writes `audit_logs`.

This answers the success-criteria questions: *who approved the change* (decision
history + reviewer id), *what recalibration is recommended* (proposal), *what caused
trust to fall* (drift evidence), *how trust changed* (history + trend).

---

## 7. Trust Provenance

`buildTrustProvenance` returns a `TrustExplanation`: every factor
(`historicalAccuracy 0.40`, `calibration 0.25`, `evidenceQuality 0.20`,
`governance 0.15` — weights mirror the Phase-16 trust model) with its value, weight,
`contribution = value × weight × 100`, a `present` flag (absent → neutral 0.5,
flagged), explicit limitations, the recent history, and the trend. Rendered by
`TrustProvenancePanel` on the history and public dashboards and reachable from the
operations strip. No score is opaque.

---

## 8. Testing

- **`packages/trust-history`** — 106 tests (history, trend, drift, provenance, fixtures).
- **`packages/recalibration-engine`** — 57 tests (propose, governance, fixtures).
- **`apps/worker/jobs/trust-monitor.test.ts`** — 8 tests (offline determinism, DB
  snapshot/drift/proposal/alert, fault isolation) using an in-memory fake client.
- **Phase 17 net-new: 171 tests.**

**Full suite: `1083 tests, 1083 pass, 0 fail`** (70 test files, run via
`npx tsx --test`). No Phase 1–16 regressions.

Coverage spans trust history, drift, recalibration proposals, governance review/
approve/reject/reverse, provenance, alert generation, worker stage, and determinism.
Migration integrity / RLS are asserted structurally (CHECK domains, role gates in the
DAL) and exercised via the engine guards; live RLS is enforced by the policies and
mirrored in the DAL for clean `DbResult` errors.

---

## 9. Build & typecheck status

| Gate | Result |
|------|--------|
| `apps/web` `tsc --noEmit` | **0 errors** |
| `apps/worker` `tsc --noEmit` | **0 errors** |
| `packages/trust-history` `tsc` | **0 errors** |
| `packages/recalibration-engine` `tsc` | **0 errors** |
| `next build` | **✓ Compiled successfully** — all 5 trust routes emitted (ƒ dynamic) |
| Full test suite | **1083 / 1083 pass** |

> Note: repo-level `next lint` currently fails on an ESLint-version incompatibility
> (`Unknown options: useEslintrc, …`) that pre-dates Phase 17 and is unrelated to these
> changes; type-checking and the production build are clean.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Append-only history grows unbounded | reads are limited (≤20k) + per-entity capped; recommend a retention/rollup job in Phase 18 |
| `entity_id` is polymorphic text (no FK) | matches the Phase-16 trust model; integrity guarded by `(entity_type, entity_id)` index + CHECK on `entity_type`; orphans are tolerated by design |
| Provenance inputs are partially derived in the DAL (accuracy/governance proxies) | every absent factor defaults to a flagged neutral 0.5 with an explicit limitation — never silently rewarded |
| Worker raises proposals every run | proposals are `pending` + cheap; de-dup/aggregation recommended for Phase 18; alerts are advisory and never auto-resolved |
| Approval moves trust but the live Phase-16 trust row update is out of scope | the override trail (`hsin_trust_overrides`) + alert capture the applied change reversibly; wiring the in-place Phase-16 row update is a Phase-18 follow-up |

---

## 11. Deployment steps

1. **Migrate.** Apply `supabase/migrations/0021_trust_history_and_governance.sql`
   (additive; safe to run after 0001–0020). Verify the six tables + RLS + the extended
   `hsin_decision_alerts_alert_type_check`.
2. **Install.** `pnpm install` (links the two new workspace packages — already added to
   `apps/web` and `apps/worker` dependencies and `tsconfig.base.json` paths).
3. **Build.** `pnpm build` (web `next build`, worker `tsc`). Both green.
4. **Test.** `npx tsx --test $(find packages apps -name '*.test.ts' …)` → 1083 pass.
5. **Worker.** Deploy the updated `outcome-alert-worker` (daily `0 7 * * *`); the Trust
   Monitoring Stage runs automatically under the service-role key. With no service-role
   env it is a safe offline no-op.
6. **Verify dashboards.** `/dashboard/trust/{public,history,proposals,drift}` render
   (live or labeled demo). Confirm a curator can approve/reject a proposal and see the
   audit trail.

---

## 12. Recommended Phase 18

- **Apply-on-approval wiring** — close the loop by updating the live Phase-16 trust row
  (and recomputing dependent scores) when a proposal is approved, with a one-click
  reversal driven by `hsin_trust_overrides`.
- **Trust retention & rollup** — periodic downsampling of `hsin_trust_history` (daily →
  weekly) with a retention policy.
- **Proposal de-duplication & batching** — collapse repeated drift into a single
  evolving proposal; cooldowns to prevent alert fatigue.
- **Cross-entity trust correlation** — detect when a source's drift propagates to the
  narratives/decisions it feeds (trust contagion).
- **External trust attestation** — signed, exportable trust + provenance bundles for
  third-party verification of published intelligence.
- **Governance SLAs** — track time-to-decision on proposals and surface overdue items.
```
