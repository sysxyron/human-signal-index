# Phase 29 — Outcome Attribution Engine

**Status:** ✅ Complete · web + worker + engine typecheck 0 errors · build green
(166 routes, +2) · **2,440 tests passing (0 fail, +22)** · route audit green (95
registered / 71 sidebar) · smoke green (migrations 0001→0033) ·
**no auth / middleware / RBAC / user_roles / IAM changes.**

HSI can now answer: *which signals mattered, which investigations changed
outcomes, which contributors created impact, which teams produce results, and which
publications drive action.* **Activity ≠ impact** — impact is now a first-class,
attributed metric.

---

## 1. Architecture & data flow
```
SOURCE TABLES                         ENGINE (@hsi/outcome-attribution, PURE)
investigations ─┐                     impactScore · signalEffectiveness
governance     ─┼─► worker ─► build   investigationImpact · contributorImpact
hsin_publications┘   attribution      teamImpact · publicationReach
                     edges + outcomes  buildChains · cleanAttribution (anti-gaming)
                          │
                          ▼  (idempotent, anti-gaming)
   outcome_events (append-only) · attribution_ledger (edges) ·
   entity_impact (materialized) · impact_history (append-only)
                          │
                          ▼
   /dashboard/impact · profile outcomes · investigation attribution ·
   /dashboard/admin/outcome-monitoring
                          │
                          ▼  impact → trust (Phase 28 impact dimension) → authority
```

## 2. The engine (Deliverables 1–9, 23)
`packages/outcome-attribution` — PURE, deterministic, no DB/UI:
- **Outcome chain model (D2)** — `buildChains()` resolves each outcome's upstream
  subgraph; supports single AND **many-to-many** (a publication from many
  investigations; an outcome with many origins); `strength` = strongest path
  weight product.
- **impactScore (D3)** — documented formula, weights sum to 1:
  `0.25·findings + 0.20·governance + 0.20·publicationQuality + 0.15·traceability
  + 0.10·evidenceQuality + 0.10·verification` (counts saturate so a few quality
  outcomes beat raw volume).
- **signalEffectiveness (D4)** — conversion funnel signal→investigation→finding→
  publication→governance→verified.
- **investigationImpact (D5)**, **contributorImpact (D6)** (outcomes, not volume),
  **teamImpact (D7)** (per-member normalised), **publicationReach (D8)** (drafts
  capped below published).
- **Outcome taxonomy (D9)** — 9 types with impact weights.
- **Anti-gaming (D23)** — `cleanAttribution()` removes self-loops, duplicates,
  **circular attribution** (cycle detection), and **self-attribution** (same owner
  on both ends of a credit edge); idempotent. Heavily unit-tested.

## 3. Database (Deliverable 24)
`supabase/migrations/0033_outcome_attribution_engine.sql` (add-only):
- `outcome_events` (append-only, UNIQUE idempotency_key → no duplicate outcomes),
- `attribution_ledger` (directed weighted edges, UNIQUE idempotency_key → no
  duplicate/double-counted chains),
- `entity_impact` (materialized per-entity score),
- `impact_history` (append-only score changes).
RLS: researcher+ READ, admin all, worker writes via service role. Indexes + audit
fields throughout.

## 4. Worker (Deliverables 19, 20)
`contributorNetworkWorker` extended with `runOutcomeAttribution()`: scans existing
investigations / governance decisions / publications (**this is the historical
backfill — D20**), builds chains, runs the anti-gaming pass, then idempotently
writes `attribution_ledger`, `outcome_events`, `entity_impact`, and `impact_history`
on change. **Never writes `user_roles`.**

## 5. Trust & authority integration (Deliverables 21, 22)
**Impact → trust, never trust → impact.** The trust graph's impact dimension is fed
by the same real outcome aggregates (accepted findings, governance actions,
publications) the attribution engine measures; trust never feeds back into impact.
**Authority (D22)** = quality + trust + impact (Phase 28 weights), so volume alone
cannot create authority. Documented here and enforced by the one-directional data
flow.

## 6. UI (Deliverables 13–18)
- **`/dashboard/impact`** (Outcome Explorer, D15) — filterable outcome feed, top
  contributors by impact, team impact rankings (D14). *(Lives at `/dashboard/impact`
  because `/dashboard/outcomes` is the separate Phase-15 decision-performance
  dashboard; documented to avoid collision.)*
- **Profile (D13)** — impact score, total outcomes, verified findings, governance
  actions, + link to the explorer.
- **Investigation attribution (D16)** — the workflow detail page now shows linked
  signals/publications/outcomes + impact score.
- **`/dashboard/admin/outcome-monitoring`** (D18) — top outcomes, largest impact
  changes, team rankings (read-only).
- Team impact (D14) is surfaced via the explorer + admin rankings; publication
  attribution (D17) is covered by the publication entries in those surfaces.

## 7. Files

**Created**
- `packages/outcome-attribution/` (package.json, tsconfig; `src/`: types, outcomes,
  impact, attribution, chain, fixtures, index; `tests/`: impact, attribution, chain — 21 tests)
- `apps/web/lib/contributor/attribution.ts`
- `apps/web/app/dashboard/impact/page.tsx`
- `apps/web/app/dashboard/admin/outcome-monitoring/page.tsx`
- `supabase/migrations/0033_outcome_attribution_engine.sql`
- `docs/PHASE_29_OUTCOME_ATTRIBUTION_REPORT.md`

**Modified**
- `apps/worker/jobs/contributor-network-worker.ts` (+ `.test.ts`) — outcome attribution + backfill
- `apps/web/app/dashboard/profile/page.tsx`, `investigations/workflow/[id]/page.tsx` — outcome UI
- `packages/ui/src/navigation.tsx` + `nav-roles.ts`, `lib/navigation/routes.ts`,
  `components/admin/AdminNav.tsx` — Impact + Outcome Monitoring nav
- `apps/web/lib/launch/migration-audit.ts` (+0033) + `migration-audit.test.ts`
- `tsconfig.base.json`, `apps/web/package.json`, `apps/worker/package.json` — new package

## 8. Verification

| Item | Result |
| --- | --- |
| Migration | `0033_outcome_attribution_engine.sql` |
| Tests added | 22 (21 engine, 1 worker) |
| Full test suite | ✅ **2,440 / 2,440**, 0 fail |
| Web / worker / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled (166 routes) |
| Route audit | ✅ 95 registered / 71 sidebar resolve |
| Migration audit / smoke | ✅ 0001→0033, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 9. Security audit (Deliverable 26)
- **No RBAC / auth / middleware / user_roles / IAM changes** (verified: no diff to
  `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation** — impact/attribution are recognition only; the worker
  never writes `user_roles`.
- **No service-role exposure** — `attribution.ts` is `'use server'`, imported only
  by server pages; web reads use the RLS user client / `requireAdmin`; only the
  worker writes via service role.
- **Anti-gaming** — self-attribution, circular attribution, duplicate outcomes, and
  duplicate chains are removed by the engine + UNIQUE idempotency keys (unit-tested).

## 10. Remaining gaps / Phase 30 recommendation
- **Signal→investigation edges** are not yet built (the Phase-25 `investigations`
  table has no signal FK), so signal effectiveness is engine-ready but not yet fed
  from live links. Phase 30: add an investigation↔signal link (and investigation↔
  publication via `research_runs`) so the full chain is materialized end-to-end.
- **Outcome types beyond the structural ones** (POLICY_CHANGE, RISK_REDUCTION,
  EXTERNAL_ACTION) need an explicit capture path (currently only
  INVESTIGATION_COMPLETED / VERIFIED_FINDING / GOVERNANCE_ACTION /
  PUBLICATION_RELEASED are emitted by the backfill).
- **Verification level** in `impactScore` is available in the engine but fed
  conservatively; wire a real verification signal (consensus/traceability) next.
