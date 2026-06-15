# Phase 37 — Commercial SaaS Foundation (HSI v1.1)

**Status:** ✅ Complete and verified · **No payments** (Stripe/invoices/tax/checkout deferred to Phase 38)
**Migration:** `0041_commercial_saas_foundation.sql` · **Tests:** 2532 pass (0 fail) · **Build:** green

---

## 1. What was built

A commercial SaaS scaffold that introduces **plans, feature entitlements, per-org
subscriptions, usage tracking, white-label branding, and an append-only audit
trail** — without any payment processing and without touching RBAC/auth.

- **Plan system (A):** `plans` catalog seeded with Community / Professional /
  Enterprise / Government (ascending tiers 0–3).
- **Feature entitlements (B):** `feature_entitlements` (per-plan flag + numeric
  limit), seeded as a 48-row matrix (12 feature keys × 4 plans) mirroring the
  `@hsi/entitlements` engine defaults. Designed for expansion (add a feature key
  in one place).
- **Organization subscriptions (C):** `organization_subscriptions` with statuses
  `trial|active|paused|expired`; every existing org seeded to **Community / active**.
- **Usage tracking (D):** `organization_usage` rollup table + a framework DAL
  helper (`recordOrgUsageAction`) + a pure evaluator (`evaluateUsage`) in the
  engine. Not wired into create paths — never blocks current behaviour.
- **Feature access engine (E):** `@hsi/entitlements` — `hasFeature`/`getLimit`/
  `requireFeature`/`withinLimit`/`remaining`/`evaluateUsage`. Pure + deterministic.
  Per-org gates exposed in the DAL (`hasFeatureForOrg`/`getLimitForOrg`/
  `requireFeatureForOrg`).
- **Plan enforcement (F):** framework gates exist but are intentionally **not**
  wired to block any create path. Community limits set to **10,000** so nothing
  blocks. `limit_value = null` means unlimited (Enterprise/Government).
- **Org billing page (G):** `/dashboard/org/billing` — current plan, status,
  entitlements, and usage-vs-limits. Read-only; **no checkout / payment actions**.
- **Org settings (H):** `/dashboard/org/settings` — name, description, logo URL,
  contact email, website, support contact. Saved through audited DAL.
- **White-label foundation (I):** `organization_branding` (logo/colors/favicon/
  footer). Infrastructure only — stored, not rendered at runtime.
- **Platform plan management (J):** `/dashboard/admin/plans` — list/edit plans,
  toggle entitlements + limits, activate/deactivate. Admin-only, all writes audited.
- **Platform usage oversight (K):** `/dashboard/admin/subscriptions` — every org's
  plan/status/usage. Read-only.
- **Org branding preview (L):** `/dashboard/org/branding` — live preview of
  logo/colors/footer; stores settings; **no runtime theme switching yet**.
- **Auditability (M):** `subscription_audit_log` — append-only, captures
  plan/entitlement/branding/settings changes (`previous_value`/`new_value` JSON).

---

## 2. Files created

**Engine — `packages/entitlements/`**
- `package.json`, `tsconfig.json`
- `src/types.ts`, `src/plans.ts`, `src/access.ts`, `src/usage.ts`, `src/index.ts`
- `tests/entitlements.test.ts` (12 tests)

**DAL & components — `apps/web/`**
- `lib/billing/billing.ts` — billing/entitlements/settings/branding/plans/subscriptions/usage DAL
- `components/billing/OrgSettingsForm.tsx`
- `components/billing/OrgBrandingForm.tsx` (with live preview)
- `components/billing/PlanEditor.tsx`

**Pages — `apps/web/app/dashboard/`**
- `org/billing/page.tsx` (G)
- `org/settings/page.tsx` (H)
- `org/branding/page.tsx` (L)
- `admin/plans/page.tsx` (J)
- `admin/subscriptions/page.tsx` (K)

**Migration**
- `supabase/migrations/0041_commercial_saas_foundation.sql`

**Docs**
- `docs/PHASE_37_COMMERCIAL_SAAS_FOUNDATION_REPORT.md` (this file)

---

## 3. Files modified

- `tsconfig.base.json` — `@hsi/entitlements` path mapping.
- `apps/web/package.json` — `@hsi/entitlements` workspace dependency.
- `apps/web/lib/launch/migration-audit.ts` — registry entry `0041`.
- `apps/web/lib/launch/migration-audit.test.ts` — length 41 / last `0041`.
- `packages/ui/src/navigation.tsx` — Organization group (+Settings/Branding/Billing),
  Administration group (+Plans/Subscriptions); icon imports.
- `packages/ui/src/nav-roles.ts` — `ALL_NAV_HREFS` (+5 hrefs); `NAV_VISIBILITY`
  (admin-only Plans/Subscriptions).
- `apps/web/components/admin/AdminNav.tsx` — Plans + Subscriptions tabs.
- `apps/web/lib/navigation/routes.ts` — `orgSettings`/`orgBranding`/`orgBilling`/
  `adminPlans`/`adminSubscriptions`.
- `pnpm-lock.yaml`, `apps/web/tsconfig.tsbuildinfo` — toolchain.

---

## 4. Migration summary (`0041`)

| Object | Type | Notes |
| --- | --- | --- |
| `plans` | table | 4 seeded (community/professional/enterprise/government) |
| `feature_entitlements` | table | unique(plan_id,feature_key); 48-row matrix seeded |
| `organization_subscriptions` | table | unique(organization_id); status check; all orgs → community/active |
| `organization_usage` | table | PK organization_id; counters default 0 |
| `organization_branding` | table | PK organization_id; logo/colors/favicon/footer |
| `subscription_audit_log` | table | append-only; jsonb prev/new; org+time index |
| `organizations` | alter | +contact_email, +website, +support_email |
| `set_updated_at` triggers | trigger | on all 5 new mutable tables |

**RLS:**
- `plans` / `feature_entitlements` — world-readable catalog (`using(true)`),
  admin-only writes (`is_admin()`).
- `organization_subscriptions` / `organization_usage` — member read
  (`is_org_member`), admin all.
- `organization_branding` — member read, **org-admin** write (`is_org_admin`),
  admin all.
- `subscription_audit_log` — org-admin read, admin all (no UPDATE/DELETE policy →
  append-only).

Idempotent (`if not exists`, `on conflict do nothing`, `drop policy if exists`).
Additive only (0001–0040 untouched). Reuses existing `is_admin`/`is_org_member`/
`is_org_admin`/`set_updated_at` helpers (no new security primitives).

---

## 5. Security review

- **No RBAC/auth/middleware/user_roles changes.** `git status` shows none of those
  files modified; grep for `user_roles`/`service_role` in `lib/billing` returns only
  comments.
- **No service-role key in app code.** All DAL reads/writes use the RLS-scoped user
  client; admin writes additionally pass `requireAdmin()`. Worker keeps its existing
  service-role boundary; no client component imports a privileged client.
- **No privilege escalation / self-upgrade.** Plan + entitlement writes are
  `requireAdmin` only; org settings/branding writes require org owner/administrator
  (org-scoped membership role, not global RBAC). Subscriptions page is read-only.
- **Org isolation preserved.** Subscriptions/usage/branding are RLS-scoped per org
  (`is_org_member`/`is_org_admin`); branding scoped per organization.
- **Auditability.** Every settings/branding/plan/entitlement mutation writes to the
  append-only `subscription_audit_log` (no UPDATE/DELETE policy).
- **No payments.** No Stripe/invoice/checkout/tax code (grep clean; only a "NO
  payments" comment). Deferred to Phase 38 per spec.

---

## 6. Verification results

| Gate | Result |
| --- | --- |
| Web typecheck (`tsc -p apps/web`) | ✅ 0 errors |
| Worker typecheck (`tsc -p apps/worker`) | ✅ 0 errors |
| Full test suite (`tsx --test`) | ✅ **2532 pass / 0 fail** (+12 entitlements) |
| Production build (`next build`) | ✅ success; all 5 new routes emitted (ƒ dynamic) |
| Route audit | ✅ passed (185 pages; every registered + sidebar route resolves) |
| Migration audit | ✅ passed (contiguous 0001→0041) |
| Security grep (service-role / user_roles / payments) | ✅ clean (comments only) |

---

## 7. Remaining gaps for Phase 38

1. **Payment processing** — Stripe integration, checkout, invoices, tax, webhooks,
   subscription lifecycle (trial→active→expired transitions driven by billing events).
2. **Self-serve plan changes** — upgrade/downgrade flows (today plan assignment is
   admin-only via DAL).
3. **Limit enforcement** — wire `requireFeatureForOrg`/`withinLimit` into investigation/
   publication/contributor create paths once real plan limits replace the high
   framework defaults.
4. **Usage metering automation** — a worker job to refresh `organization_usage`
   rollups (`computed_at`); currently only the manual `recordOrgUsageAction` helper.
5. **Runtime white-label theming** — render `organization_branding` (colors/logo/
   favicon/footer) across the app; today it is stored + previewed only.
6. **Custom domains** — entitlement flag exists; domain provisioning/verification not built.
