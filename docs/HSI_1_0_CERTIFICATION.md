# HSI 1.0 — Production Readiness Certification

**Release candidate:** Human Signal Index 1.0
**Certified gates (this build):** typecheck ✅ · build ✅ (177 routes) ·
**2,492 tests / 0 fail** ✅ · route audit ✅ (102 registered / 78 sidebar) ·
migration audit ✅ (0001→0037) · production smoke ✅ (0 fail) · security review ✅.

**Launch recommendation: GO** for a controlled 1.0 release, with the post-launch
follow-ups in §7 tracked. Rationale below.

---

## 1. Architecture summary
HSI is a pnpm/Turbo monorepo: a Next.js 14 App Router web app + a worker, on top of
**43 `@hsi/*` packages** (pure, deterministic engines: no `Date.now()`/`Math.random()`,
no DB/UI in engines). The end-to-end intelligence pipeline is:

```
Signal → Evidence → Investigation → Review → Governance → Publication → Outcome
        → Trust → Authority → Lineage   (+ Contributor Network, CMS, Beta Ops)
```

Data flows are one-directional where it matters: **activity→XP**, **quality→
reputation**, **impact→trust→authority** (never the reverse), and **lineage**
materialises the chain so every artifact is traceable. Access is governed solely by
RBAC + middleware; all recognition layers (XP, ranks, badges, trust, authority,
impact) are **advisory and never grant access**.

## 2. Subsystem inventory
Signal Intelligence · Evidence Vault · Investigations + workflow · Review queue ·
Governance · Publications/Publishing · Forecasting & Scenarios · WorldForge
simulation · Executive Intelligence · Human Operations OS · Contributor
Intelligence Network (XP/missions/badges/ranks/credits/leaderboards) · Trust Graph
& Authority · Operational Trust Wiring · Outcome Attribution · Intelligence Lineage
Graph · CMS & Content Operations · Tester Program & Beta Operations · Launch
Readiness & Monitoring.

## 3. Route inventory
**139 dashboard pages**; route registry validated by `route-audit.ts`
(**102 registered + 78 sidebar routes all resolve**). Restricted routes are
enforced by `middleware.ts` + `requiredRoleForRoute` (role ladder
viewer<researcher<reviewer<curator<admin); hidden menus are UX-only and never the
security boundary (`route-gate.test.ts`).

## 4. Worker inventory
**39 registered jobs** (`apps/worker/jobs/index.ts`), including the consolidated
`contributorNetworkWorker` which recomputes — deterministically, `runAt` injected,
offline-safe — XP/missions/badges/ranks, reputation, **trust + authority**,
**outcome attribution + entity impact**, **lineage backfill + graph health**, team
metrics, and leaderboards. **No worker ever writes `public.user_roles`** or
performs an autonomous privileged action.

## 5. Data + migrations
**37 contiguous migrations (0001→0037)**, all add-only, verified by the migration
audit + production smoke test. Append-only audit/event/history tables back the
trust, outcome, lineage, contribution, CMS, and ops subsystems (immutable record).
RLS is enforced on every new table; service-role writes are worker-only (server).

## 6. Security posture
- **RBAC/auth/middleware unchanged across Phases 25–33** (verified by diff each
  phase: no edits to `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, IAM DAL).
- **No role escalation / self-approval** — privileged roles are granted only via
  admin-approved `role_applications`; `role_applications.requested_role` excludes
  admin at the DB layer; recognition tiers are cosmetic.
- **Anti-gaming** — self-validation, circular/duplicate attribution, double-award,
  and self-attribution are rejected by the engines + UNIQUE idempotency keys
  (unit-tested).
- **Service-role safety** — never imported client-side; CMS + beta + readiness DALs
  use the RLS user client + `requireAdmin`; only the worker uses service role.
- **Audit export** neutralises spreadsheet formula injection; CMS/IAM/trust/outcome
  actions are audited.
- **Known non-gate:** `next lint` is broken on an ESLint-v9 flat-config
  incompatibility (pre-existing, unrelated to features); typecheck + build + the
  2,492-test suite are the quality gates.

## 7. Post-launch follow-ups (tracked, non-blocking)
1. Worker **heartbeat** table for exact health (currently derived from output
   `computed_at`).
2. Live **queue backlog** counts wired into system health.
3. Auto-derive `investigation_signals` / `investigation_publications` lineage links
   (today: reviewer+ link actions + `publication_evidence` backfill).
4. Real quality feeds for the remaining trust placeholders (review-vs-governance
   already wired; consistency windows + overdue still neutral).
5. CMS structured-content editor forms + media upload; flip marketing pages to
   `getPublishedPage` with fallback.
6. Backup/restore automation (Supabase PITR) recorded in `backup_runs`/`recovery_tests`.

## 8. Certification
On this build HSI 1.0 demonstrates **operational readiness** (health + monitoring),
**security readiness** (unchanged RBAC, audited, anti-gaming), **data integrity**
(lineage validation + integrity audit, no critical issues), **auditability**
(append-only logs + export), **role safety** (no escalation), **recoverability**
(backup/recovery registries), and **launch readiness** (release checklist + config
audit). **Recommendation: GO** for controlled 1.0 release.
