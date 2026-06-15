# Phase 28 — Operational Trust Wiring

**Status:** ✅ Complete · web + worker + engine typecheck 0 errors · build green ·
**2,418 tests passing (0 fail, +9)** · route audit green (154 pages) · smoke test
green (migrations 0001→0032) · **no auth / middleware / RBAC / user_roles / IAM /
invitation changes.**

Trust scores now derive from **real operational outcomes** — review-vs-governance
agreement, governance effectiveness, publication quality, investigation completion
and impact. The placeholder trust calculations are gone.

---

## 1. What changed (placeholders → real)
| Dimension | Phase 27 (placeholder) | Phase 28 (real source) |
| --- | --- | --- |
| Review accuracy | neutral 0/0 | `investigation_reviews` ⋈ `investigation_governance_decisions` (agreement when the reviewer's decision matched the governance outcome) |
| Governance effectiveness | — | governance decisions vs the investigation's final status (cleared→published = confirmed) |
| Publication quality | 0.5 traceability / 0.5 governance | `hsin_publications` state (APPROVED/PUBLISHED vs RETRACTED) + `trust_score` (traceability) + `evidence_count` (evidence completeness) |
| Investigation completion | `investigationsOwned` proxy | `investigations` status → completed / abandoned / opened |
| Investigation impact | — | accepted findings + governance actions + publications delivered per completed investigation |

The worker reads these source tables directly, so existing contributors are
**backfilled** on the next run (Deliverable 16).

## 2. Engine (Deliverables 5, 6, 9, 10, 13)
`@hsi/trust-graph` extended (PURE, deterministic):
- `impactScore()` (D5) and `governanceEffectiveness()` (D2) — new 0..100 scores.
- **Authority recompute (D9, no placeholder)** — `AUTHORITY_WEIGHTS` now blends
  trust 0.30 · accuracy 0.20 · reliability 0.20 · publicationQuality 0.15 ·
  **impact 0.15** (sum 1). `TrustScores` now carries `impact` +
  `governanceEffectiveness`.
- **Trust events (D6)** — five new types: `INVESTIGATION_ACCEPTED/REJECTED`,
  `GOVERNANCE_CONFIRMED`, `PUBLICATION_HIGH_CONFIDENCE/LOW_CONFIDENCE` (weighted;
  the investigation-validation pair joins the anti-gaming exclusion set).
- **Contributor insights (D13)** — `contributorInsights()` → strengths
  (Strong Reviewer / Investigator / Publisher …) + weak areas.
- **Team effectiveness (D10)** — `teamEffectiveness({acceptance, completion, impact})`.

## 3. Worker (Deliverables 1–5, 7, 8, 17)
`contributorNetworkWorker` extended to:
- `loadOutcomes()` — bulk-load real outcomes per user from source tables (the
  backfill path); feed `trustInputsFor(agg, outcomes)`; process the **union** of
  users with activity OR operational outcomes.
- Upsert `impact_score` + `governance_effectiveness` and append `trust_history`
  on change.
- **Missions (D7)** — `deriveMissionProgress()` advances each mission's `progress`
  from real aggregates (signals submitted, reviews completed, evidence, reports,
  investigations) before recomputing status. **Badges (D8)** already award from
  these real metrics.
- **Team effectiveness (D10)** + **team-domain leaderboards (D14)** — Global +
  Research/Review/Governance/Security authority boards, plus `team_effectiveness`
  rollups. **Never writes `user_roles`.**

## 4. UI (Deliverables 11–15)
- **Profile** — trust & authority block now shows strengths/weaknesses chips and a
  **trust-evolution timeline** (D11/D12/D13).
- **`/dashboard/authority`** — added a strength-analysis section (insights).
- **`/dashboard/leaderboard`** — added Global + Research/Review/Governance/Security
  tabs (D14).
- **`/dashboard/admin/trust-monitoring`** — added a **recent trust & authority
  changes** table with prev→new scores + reasons (D15), alongside the existing
  rapid-move + ranking panels.

## 5. Database (Deliverable 18)
`supabase/migrations/0032_operational_trust_wiring.sql` (add-only):
- `trust_profiles` + `impact_score`, `governance_effectiveness`.
- `trust_events` CHECK extended with the five new event types.
- `team_effectiveness` table (acceptance/completion/impact/effectiveness; RLS
  researcher+ read, admin all, audit fields, `set_updated_at`).
- `leaderboard_snapshots.view` CHECK extended with `global`/`research`/`review`/
  `governance`/`security`.

## 6. Files

**Created**
- `packages/trust-graph/src/insights.ts` (+ `tests/impact.test.ts`)
- `supabase/migrations/0032_operational_trust_wiring.sql`
- `docs/PHASE_28_OPERATIONAL_TRUST_WIRING_REPORT.md`

**Modified**
- `packages/trust-graph/src/` — types, scores (impact/governance/authority),
  events (5 types), fixtures, index
- `packages/trust-graph/tests/` — events count, (impact suite added)
- `apps/worker/jobs/contributor-network-worker.ts` (+ `.test.ts`) — real outcomes,
  mission progress, team effectiveness, domain leaderboards, backfill
- `apps/web/lib/contributor/trust.ts` — insights, recent changes, impact fields
- `apps/web/lib/contributor/leaderboard.ts` — domain views
- `apps/web/app/dashboard/authority/page.tsx`, `profile/page.tsx`,
  `leaderboard/page.tsx`, `admin/trust-monitoring/page.tsx` — UI
- `apps/web/lib/launch/migration-audit.ts` (+0032) + `migration-audit.test.ts`

## 7. Verification

| Item | Result |
| --- | --- |
| Migration | `0032_operational_trust_wiring.sql` |
| Tests added | 9 (trust-graph impact/insights/team/governance) |
| Full test suite | ✅ **2,418 / 2,418**, 0 fail |
| Web / worker / engine typecheck | ✅ 0 errors each |
| Build | ✅ compiled |
| Route audit | ✅ 154 pages resolve |
| Smoke test | ✅ migrations 0001→0032, 93 routes, 69 sidebar links, 0 fail |
| `next lint` | ⚠️ pre-existing ESLint-v9 incompatibility (not a gate) |

## 8. Security review
- **auth / middleware / RBAC / user_roles / IAM / invitation flow — not touched**
  (verified: no diff to `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation / self-assignment** — recognition levels stay cosmetic; the
  worker never writes `user_roles`; self-validation excluded by the engine.
- **No service-role exposure** — trust reads use the RLS user client / `requireAdmin`;
  only the worker writes via service role.

## 9. Remaining gaps
- **Reliability consistency windows** (active vs total time windows) are still
  neutral — completion is now the real, dominant reliability input; activity-window
  consistency is a minor follow-up.
- **Governance-effectiveness proxy** uses the investigation's final status as the
  "later outcome"; a direct investigation→publication link would sharpen it.
- **Review accuracy** only scores reviews on investigations that already have a
  governance decision (others are not yet scorable).
- **Overdue assignments** are not yet fed (left 0) — needs the operations/assignment
  due-date feed.

## 10. Phase 29 recommendation
Close the operational loop end-to-end: (1) link investigations → publications so
governance effectiveness and impact use the real publication outcome; (2) feed
reliability windows + overdue assignments from the operations/assignment tables;
(3) emit `trust_events` rows from the recorder at write time (so the timeline is
per-event, not per-recompute); and (4) begin using authority to **weight**
advisory signals (e.g. consensus weighting) — strictly recommendation-only, never
access.
