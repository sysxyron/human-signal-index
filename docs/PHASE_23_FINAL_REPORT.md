# Phase 23 — Production Beta Launch, Tester Onboarding & Deployment Hardening

**Status:** ✅ Complete · build green (108 pages) · typecheck green · **2,076 tests
passing (0 fail, +24)** · route audit green · RBAC green · navigation green · smoke
test green (0 fail).

**Deployment recommendation:** **READY** for public beta testing — structurally and
in code. Before inviting external testers, the operator must confirm the live
**Launch Center** shows READY against the production environment (env set,
migrations applied, admin assigned, backups enabled) — the deployment checklist in
`docs/deployment/production-beta-launch.md`.

---

## 1. Overview

Phase 23 builds the **Production Beta Operations Layer** — it adds no intelligence
engines. It answers: is the system deployable, healthy, migrated, role-correct,
tester-ready, and safe for external users? Two pure, fully-tested engines
(readiness scoring + migration audit) feed an admin **Launch Operations Center**, a
tester **Onboarding** portal, a governed **Beta Issue System**, a hardened debug
endpoint, a **production smoke test**, and complete launch documentation. Every
Phase 1–22A governance guarantee is preserved.

## 2. Architecture

```
facts (env, health probes, migrations, RBAC, testers)
   → lib/launch/persistence.ts (admin-only DAL, offline-safe)
       → migration-audit.ts (PURE)   classify 0001→0026
       → readiness.ts (PURE)         areas RED/YELLOW/GREEN + score + READY?
   → /dashboard/launch (admin)       Launch Operations Center + Admin metrics
   → /dashboard/security (admin)     + migration audit panel
   → /dashboard/launch/issues        Beta Issue System (governed placeholder, all roles)
   → /dashboard/tester-onboarding    Tester portal (all roles)
scripts/production-smoke-test.ts      static + optional live launch checks
```

Pure engines decide; the DAL only collects facts and never writes. The readiness
recommendation is **READY** iff there are no launch blockers and the score ≥ 80.

## 3. Files added

**Pure engines + tests**
- `apps/web/lib/launch/migration-audit.ts` (+ `.test.ts`, 10 tests)
- `apps/web/lib/launch/readiness.ts` (+ `.test.ts`, 14 tests)

**DAL / view / actions / types**
- `apps/web/lib/launch/{persistence,view,actions,types}.ts`

**Pages**
- `apps/web/app/dashboard/launch/page.tsx` (Launch Operations Center + admin metrics)
- `apps/web/app/dashboard/launch/issues/page.tsx` (Beta Issue System)
- `apps/web/app/dashboard/tester-onboarding/page.tsx` (Onboarding portal)

**Components**
- `apps/web/components/launch/{MigrationStatusPanel,panels,IssueReportForm,IssueList}.tsx`

**Script**
- `scripts/production-smoke-test.ts`

**Docs**
- `docs/BETA_TESTER_ROLE_MATRIX.md`, `docs/ROUTE_ACCESS_AUDIT.md`,
  `docs/deployment/production-beta-launch.md`, `docs/BETA_TEST_EXECUTION_PLAN.md`,
  `docs/PHASE_23_FINAL_REPORT.md`

## 4. Files modified

- `apps/web/lib/security/rbac-audit.ts` — `PROTECTED_ROUTES`: `/dashboard/launch`
  (admin) + `/dashboard/launch/issues` (viewer override).
- `apps/web/lib/navigation/routes.ts` — registry: launch, launchIssues,
  testerOnboarding.
- `packages/ui/src/navigation.tsx` — new "Launch & Beta" sidebar group + icons.
- `apps/web/app/dashboard/security/page.tsx` — migration audit panel (Deliverable 2).
- `apps/web/app/api/debug/rbac/route.ts` — **hardened**: admin-only + 404 in prod.

## 5. Routes added

| Route | Access | Purpose |
| --- | --- | --- |
| `/dashboard/launch` | admin | Launch Operations Center + admin launch metrics |
| `/dashboard/launch/issues` | any signed-in | Beta Issue System (report + sample log) |
| `/dashboard/tester-onboarding` | any signed-in | Tester onboarding portal |

## 6. Tests added

24 new (suite 2,052 → **2,076**, 0 fail):
- `migration-audit.test.ts` (10): expected set shape, all-applied, null/unverifiable,
  missing tail, gap → out-of-order, failed, drift/extra, timestamped versions,
  empty, deterministic.
- `readiness.test.ts` (14): healthy→GREEN/100/READY, supabase/env/migration/rbac/
  blocker/debug → RED blockers, service-role→YELLOW-but-READY, unknown→YELLOW,
  zero-testers, score weighting, area mapping, deterministic.

## 7. Deployment readiness

- **Migration verification** (Deliverable 2): `auditMigrations` classifies
  0001→0026 as applied/missing/out-of-order/failed/unknown; exposed in the Launch
  Center and the Security dashboard; the smoke test confirms the committed files
  match `EXPECTED_MIGRATIONS`.
- **Launch Operations Center** (Deliverables 1 & 10): readiness score, overall +
  six area statuses (production/migration/role/tester/deployment/security) as
  RED/YELLOW/GREEN, blockers, env, connectivity, tester/RBAC — all from live
  signals, offline-safe demo otherwise.
- **Smoke test** (Deliverable 8): migrations present, route-registry integrity,
  sidebar targets, RBAC map, env, optional live homepage/redirect/health. PASS with
  warnings in a no-env shell; FAILs hard-exit 1 for CI.

## 8. Security review (Deliverable 9)

`/api/debug/rbac` is hardened in depth:
1. **404 in production** (`NODE_ENV==='production'`) — does not exist there.
2. **Admin-only** otherwise — non-admins get 404 (no existence disclosure).
3. Returns only id/email/role-names/source — **no tokens, cookies, or secrets**.

No JWT data, internal permissions, or user mappings are exposed to non-admins. The
env panels mask secret values and flag any secret exposed via a `NEXT_PUBLIC_` name.

## 9. RBAC review

Unchanged from the Phase 22A repair and re-verified: roles resolve from
`public.user_roles → roles` everywhere (middleware, server, all DALs). New launch
routes are correctly gated (admin for the center; viewer-override so any tester can
file issues). The route access matrix (`docs/ROUTE_ACCESS_AUDIT.md`) shows no
missing/incorrect checks, orphan, or hidden routes.

## 10. Tester workflow

Onboarding portal (about, what/what-not to test, severity, privacy + governance
notices) → role assignment per the Role Matrix → testing per the 5-phase Execution
Plan → findings via the governed Beta Issue System (acknowledged for human triage;
never auto-filed/auto-acted). The five-phase plan: internal admin → role testing →
external cohort → launch review → production deployment.

## 11. Remaining risks

- **Migration verifiability:** `supabase_migrations.schema_migrations` is usually
  not exposed via PostgREST, so the in-app audit may read as "unverifiable"
  (YELLOW, not a blocker). Verify authoritatively with `supabase migration list`.
  Not a regression — honestly surfaced.
- **DB `current_app_role()` ranking quirk** (carried from 22A): admin unaffected; a
  user whose only roles are curator/researcher co-assigned with viewer could be
  mis-ranked at the RLS layer. Future 1-line DB fix.
- **Beta Issue System is a governed placeholder** (no persistence) — by design
  (the spec allowed this). A future migration could add `hsin_beta_issues` for a
  real tracker.
- **Live readiness depends on the operator** completing the deployment checklist;
  the Launch Center computes READY/NOT READY against the real environment at deploy
  time.

## 12. Recommendations for Phase 24

- Persist beta issues to a governed `hsin_beta_issues` table + triage board.
- Add a SECURITY DEFINER `applied_migrations()` RPC so the in-app migration audit
  is always verifiable without the service role.
- Fix `current_app_role()` ordering to rank all five roles.
- Add per-tester telemetry (routes visited, issues filed) to the Launch Center.
- Automated synthetic E2E (Playwright) per role against a seeded staging DB.

---

## Verification results

| Check | Result |
| --- | --- |
| `tsc --noEmit -p apps/web` | ✅ 0 errors |
| `pnpm --filter web build` | ✅ Compiled, **108 pages**, 3 new routes |
| Full test suite | ✅ **2,076 / 2,076** (+24) |
| `apps/web/scripts/route-audit.ts` | ✅ 125 pages, 0 missing |
| `scripts/production-smoke-test.ts` | ✅ 8 checks, 0 fail (5 env/live warnings) |
| RBAC / navigation | ✅ green |
| Regressions (Phases 1–22A) | none |

**PHASE 23 — BETA READY.** Recommendation: **READY** for public beta testing, gated
on the operator confirming the live Launch Center shows READY and the deployment
checklist is complete.
