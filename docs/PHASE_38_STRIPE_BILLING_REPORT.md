# Phase 38 — Stripe Billing & Subscription Automation (HSI v1.1)

**Status:** ✅ Complete and verified · **Migration:** `0042_stripe_billing.sql` ·
**Tests:** 2557 pass (0 fail) · **Build:** green · **No RBAC/auth/middleware/user_roles changes**

HSI is now a revenue-capable SaaS: Stripe-hosted checkout, self-service billing
portal, subscription lifecycle sync, usage metering, plan enforcement, trials,
invoicing, and MRR/ARR reporting — all additive over the Phase-37 foundation.

---

## 1. What was built

- **Billing engine `@hsi/billing`** (pure, unit-tested): pricing resolution,
  subscription status mapping + reconciliation, trial math, usage metering,
  revenue rollups (MRR/ARR/distribution), invoice shaping, checkout/portal input
  builders, and webhook classification + replay protection.
- **Stripe SDK boundary** (`lib/billing/stripe.ts`, server-only): the only module
  that touches the `stripe` package + `STRIPE_SECRET_KEY`. Lazily loaded so the app
  typechecks/builds with or without the SDK installed; degrades to "billing not
  enabled" when unconfigured.
- **Customer creation** (C): `createCustomerAction`/`getCustomerAction` +
  auto-`ensureCustomer` on first checkout; persists `stripe_customers`.
- **Billing Center** (D): `/dashboard/org/billing` — plan, status, renewal, trial
  countdown, usage-vs-limits, Stripe-hosted upgrade (monthly/annual), invoices.
- **Billing Portal** (E): `createBillingPortalSessionAction` + "Manage Billing"
  (payment method, address, invoices, cancel, reactivate — all Stripe-hosted).
- **Subscription sync** (F): `syncSubscriptionAction` + webhook sync reconcile
  `stripe_subscriptions` → `organization_subscriptions` so entitlements resolve.
- **Webhooks** (G): `/api/webhooks/stripe` — signature-verified, raw events stored
  to `stripe_events`, idempotent (replay-safe), handles the 7 required events.
- **Usage metering** (H): `trackUsageAction`/`incrementUsageAction`/
  `decrementUsageAction`/`resetMonthlyUsageAction` over `organization_usage`.
- **Entitlement enforcement** (I): `canUseFeatureAction` + integrated non-blocking
  gates on investigation create, publication create, and member invite (friendly
  "Upgrade Required" message; never crashes; high Community limits keep it open).
- **Subscription administration** (J): `/dashboard/admin/subscriptions` — plan,
  status, MRR, renewal, usage, with status filters.
- **Revenue dashboard** (K): `/dashboard/admin/revenue` — MRR/ARR/active/trialing/
  past-due/canceled + plan distribution summary cards.
- **Invoice management** (L): `listInvoicesAction` (live Stripe list, cached
  fallback) + hosted/PDF links on the Billing Center.
- **Trial management** (M): 14-day default trial (`DEFAULT_TRIAL_DAYS`), days
  remaining, expiry handling, conversion via checkout.
- **Auditability**: every billing mutation → append-only `billing_audit_log`
  (`app`/`webhook`/`system` source).

---

## 2. Files created

**Engine — `packages/billing/`**
- `package.json`, `tsconfig.json`
- `src/`: `types.ts`, `stripe.ts`, `subscriptions.ts`, `usage.ts`, `invoices.ts`,
  `checkout.ts`, `portal.ts`, `webhooks.ts`, `index.ts`
- `tests/billing.test.ts` (21 tests)

**Web — `apps/web/`**
- `lib/billing/stripe.ts` — Stripe SDK boundary (server-only)
- `lib/billing/sync.ts` — Stripe→DB sync helpers (client-agnostic)
- `lib/billing/sync.test.ts` (4 tests)
- `components/billing/BillingActions.tsx` — checkout + portal + cycle toggle (client)
- `components/billing/SubscriptionsTable.tsx` — admin table + filters (client)
- `app/api/webhooks/stripe/route.ts` — webhook endpoint (Node runtime)
- `app/dashboard/admin/revenue/page.tsx` — revenue dashboard

**Migration**
- `supabase/migrations/0042_stripe_billing.sql`

**Docs**
- `docs/PHASE_38_STRIPE_BILLING_REPORT.md` (this file)

---

## 3. Files modified

- `tsconfig.base.json` — `@hsi/billing` path mapping.
- `apps/web/package.json` — `@hsi/billing` workspace dependency.
- `apps/web/lib/billing/billing.ts` — Stripe DAL (customer/checkout/portal/sync/
  invoices/usage/enforcement/revenue/admin subscriptions).
- `apps/web/lib/launch/migration-audit.ts` + `.test.ts` — registry `0042`, length 42.
- `apps/web/app/dashboard/org/billing/page.tsx` — rebuilt as the Billing Center.
- `apps/web/app/dashboard/admin/subscriptions/page.tsx` — MRR/renewal + filters.
- `apps/web/lib/collective/actions.ts` — investigation create enforcement gate.
- `apps/web/lib/publishing/actions.ts` — publication create enforcement gate.
- `apps/web/lib/org/organizations.ts` — member-invite contributors-limit gate
  (pure-helper based; no billing import → no cycle).
- `packages/ui/src/navigation.tsx`, `packages/ui/src/nav-roles.ts`,
  `apps/web/components/admin/AdminNav.tsx`, `apps/web/lib/navigation/routes.ts` —
  Revenue nav wiring.
- `pnpm-lock.yaml`, `apps/web/tsconfig.tsbuildinfo` — toolchain.

> Note: **no** `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, `user_roles`, or IAM
> DAL files were modified (an initial startup-env addition that rippled into a
> `lib/auth` test was reverted to honor the constraint).

---

## 4. Migration summary (`0042`)

| Object | Type | Notes |
| --- | --- | --- |
| `stripe_customers` | table | org ↔ customer (PK org_id, unique customer_id) |
| `stripe_subscriptions` | table | per-org Stripe mirror (status/cycle/period/cancel/trial) |
| `stripe_events` | table | webhook ledger, **unique(stripe_event_id)** → replay-safe |
| `billing_invoices` | table | cached Stripe invoices (hosted URLs) |
| `billing_audit_log` | table | **append-only** (app/webhook/system source) |
| `organization_subscriptions` | alter | +stripe ids, billing_cycle, period, cancel, trial_ends_at |
| `organization_usage` | alter | +signals, +last_reset_at |
| `set_updated_at` triggers | trigger | stripe_customers, stripe_subscriptions |

**RLS:** customers/subscriptions/invoices → member read + admin all; `stripe_events`
→ admin only (raw payloads never org-visible); `billing_audit_log` → org-admin read,
admin all. Webhooks write via the **service-role** client (server-only, same trust
boundary as the worker). Idempotent + additive (0001–0041 untouched); reuses
`is_admin`/`is_org_member`/`is_org_admin`/`set_updated_at`.

---

## 5. Stripe architecture

```
Browser ──"Upgrade"──▶ createCheckoutSessionAction (org-admin, DAL)
  └ ensureCustomer → stripe_customers     │ builds CheckoutSessionInput (@hsi/billing)
                                          ▼
                              Stripe-hosted Checkout  ◀── no card data touches HSI
                                          │ completes
                                          ▼
Stripe ──webhook──▶ /api/webhooks/stripe (Node, service-role)
  1 verify signature (sdkConstructEvent)
  2 decideProcessing(eventId,type,seen)  ── replay-safe (+ unique stripe_event_id)
  3 store raw → stripe_events
  4 classifyEvent → sync_subscription | record_invoice | record_customer
  5 applySubscriptionSync: reconcile → stripe_subscriptions + organization_subscriptions
  6 mark processed
                                          ▼
            @hsi/entitlements resolves the plan → features/limits everywhere

"Manage Billing" ─▶ createBillingPortalSessionAction ─▶ Stripe Billing Portal
```

- **Pure/SDK split:** `@hsi/billing` holds all decision logic (testable, no SDK);
  `lib/billing/stripe.ts` is the only SDK caller; `lib/billing/sync.ts` is
  client-agnostic so both the DAL (RLS user client) and the webhook (service-role)
  reuse the exact same reconciliation.
- **Access model:** `trialing`/`active`/`past_due` keep premium entitlements;
  `unpaid`/`paused`/`canceled` fall back to **community** (lapsed orgs never retain
  premium).
- **Env-tolerant:** unconfigured → friendly "billing not enabled"; the SDK is
  lazy-loaded via a non-literal specifier so typecheck + build pass without `stripe`
  installed (build emits one benign webpack "Critical dependency" warning).

---

## 6. Usage enforcement model

- **Counters** (`organization_usage`): signals, investigations, publications,
  storage, users — metered via track/increment/decrement, monthly reset supported
  (`isNewBillingPeriod` + `resetMonthlyUsageAction`).
- **Limits** come from the plan's entitlements (`@hsi/entitlements` `getLimit`):
  `investigations_limit`, `publications_limit`, `contributors_limit`. `null` =
  unlimited (Enterprise/Government); Community = high (10,000) → never blocks today.
- **Gate** (`canUseFeatureAction`): returns `{allowed, reason, upgradeRequired,
  limit, used}`; never throws. Unmapped actions (signal/storage) always allowed.
- **Integration points:** investigation create, publication create, member invite —
  each checks the gate first and returns a friendly "Upgrade required" message when
  a real limit is exceeded. Under current Community defaults nothing is blocked, so
  no existing workflow breaks.

---

## 7. Security review

- **No RBAC/auth/middleware/user_roles/IAM changes** — verified by `git status`
  (none of `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, `user_roles`, IAM DAL).
- **Stripe secrets server-only** — `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are
  read exclusively in `lib/billing/stripe.ts`; greps confirm no client component or
  page references them, and no client imports the SDK boundary.
- **No service-role key in client code** — webhook uses the server-only service
  client (same boundary as the worker); the user-facing DAL uses the RLS client +
  org-admin/`requireAdmin` gates.
- **Webhook safety** — signature verified before any work; invalid → 400; raw
  events stored; idempotent via `decideProcessing` + the `stripe_events` unique
  constraint (duplicate/unhandled acknowledged, never re-applied).
- **Org isolation** — billing tables RLS-scoped per org; raw `stripe_events`
  admin-only.
- **Auditability** — every mutation (checkout, portal, sync, usage, customer) →
  append-only `billing_audit_log`.
- **No card data** — Stripe-hosted checkout + portal only.

---

## 8. Verification results

| Gate | Result |
| --- | --- |
| Web typecheck | ✅ 0 errors |
| Worker typecheck | ✅ 0 errors |
| `@hsi/billing` typecheck | ✅ 0 errors |
| Full test suite | ✅ **2557 pass / 0 fail** (+25) |
| Production build | ✅ success; `/api/webhooks/stripe`, `/dashboard/admin/revenue`, rebuilt billing/subscriptions all emitted |
| Route audit | ✅ passed (186 pages) |
| Migration audit | ✅ contiguous 0001→0042 |
| Webhook replay safety | ✅ `decideProcessing` tests + unique `stripe_event_id` |
| Subscription sync validation | ✅ `reconcileSubscription` + `snapshotFromStripeSubscription` tests |
| Usage enforcement validation | ✅ `withinLimit`/`getLimit` tests + integrated gates |
| No RBAC / auth changes | ✅ confirmed via git status + grep |

---

## 9. Remaining gaps for Phase 39

1. **Proration & scheduled plan changes** — mid-cycle upgrade/downgrade proration
   and downgrade-at-period-end UX (today checkout starts a new subscription).
2. **Dunning automation** — past-due email cadence + auto-suspend after grace,
   driven by `invoice.payment_failed` beyond the current status sync.
3. **Worker usage rollup** — a scheduled job to recompute `organization_usage` from
   source tables and trigger `resetMonthlyUsageAction` on period rollover.
4. **Tax & multi-currency** — Stripe Tax, VAT/GST IDs, per-region pricing.
5. **Metered/usage-based pricing** — Stripe metered prices for overage billing
   beyond fixed plan limits.
6. **Hardening** — wire enforcement into remaining write paths (signals, storage
   upload), and add coupons/promo + entitlement-driven feature gating UI.
7. **Revenue analytics depth** — churn, LTV, cohort retention, charts (current
   dashboard is summary cards only).
8. **Webhook ops** — replay/dead-letter tooling + alerting on `stripe_events.error`.
