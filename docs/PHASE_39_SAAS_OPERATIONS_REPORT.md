# Phase 39 — Commercial Operations & SaaS Intelligence (HSI v1.1)

**Status:** ✅ Complete and verified · **Migration:** `0043_saas_operations.sql` ·
**Tests:** 2577 pass (0 fail) · **Build:** green · **No RBAC/auth/middleware/user_roles changes**

Phase 39 completes the SaaS operations layer over Phases 37–38: subscription
lifecycle automation (proration), usage rollups, overage tracking, and the full
analytics suite — revenue movement, churn, cohorts, LTV, subscription health,
forecasting, billing operations, and webhook operations.

---

## 1. What was built

- **SaaS operations engine `@hsi/saas-ops`** (pure, 20 tests): revenue metrics
  (MRR/ARR/growth/expansion/contraction/churned/net-new), churn risk, subscription
  health, LTV, cohorts, usage rollups + overage tracking, proration math,
  billing-ops summarization, webhook dead-letter ops, and revenue forecasting.
- **Proration (C):** `previewProrationAction`, `upgradePlanAction`,
  `downgradePlanAction` — upgrades apply immediately (`create_prorations`),
  downgrades defer to next cycle; Stripe stays the source of truth and HSI reflects
  it via sync. Fully audited.
- **Usage rollups (D):** `computeUsageRollupsAction` → monthly per-org snapshots in
  `usage_rollups` (current/previous/lifetime supported by the pure helpers).
- **Overage tracking (E):** `trackOverages` over user/storage/publication/
  investigation/signal limits — tracking only, never auto-bills.
- **Subscription health (F):** `computeSubscriptionHealth` → healthy/warning/at-risk
  from active users, usage trend, login recency, content/investigation/publication
  activity; persisted to `subscription_health`.
- **Churn (G):** `computeChurnRisk` → low/medium/high from declining usage,
  inactivity, payment failures, expiring trials; history in `churn_events`.
- **LTV (H):** `computeLTV` → total revenue, duration, average monthly, projected
  value.
- **Cohorts (I):** `computeCohorts` by signup/activation month or plan → retention/
  engagement/churn; snapshots in `cohort_snapshots`.
- **Revenue analytics (J):** `computeRevenueMetrics` with movement vs the last
  snapshot; persisted to `revenue_snapshots`.
- **Revenue dashboard (K):** `/dashboard/admin/revenue` — MRR/ARR + trend sparkline,
  expansion/contraction/churned/net-new, forecast cards, plan distribution, cohort
  retention.
- **Subscription health dashboard (L):** `/dashboard/admin/subscription-health` —
  per-org health/churn with status filters.
- **Billing operations dashboard (M):** `/dashboard/admin/billing-ops` — active/
  trial/canceled/past-due, payment failures, overage orgs, recent changes.
- **Webhook operations (N):** `/dashboard/admin/webhooks` — processed/failed/dead-
  letter counts + dead-letter queue with replay; `replayWebhookAction`/
  `retryFailedWebhookAction`; failures captured to `webhook_deadletters`.
- **Forecasting (O):** `computeForecast` — next-month MRR, next-quarter ARR, growth
  + churn projection from MRR history.
- **Org billing insights (P):** `/dashboard/org/billing` gains usage trend,
  projected overages, subscription health and renewal forecast (owners only).

---

## 2. Files created

**Engine — `packages/saas-ops/`**
- `package.json`, `tsconfig.json`
- `src/`: `types.ts`, `revenue.ts`, `churn.ts`, `health.ts`, `ltv.ts`, `cohorts.ts`,
  `usage-rollups.ts`, `billing-ops.ts`, `webhook-ops.ts`, `forecasting.ts`, `index.ts`
- `tests/saas-ops.test.ts` (20 tests)

**Web — `apps/web/`**
- `lib/saas-ops/operations.ts` — SaaS-ops DAL (revenue/health/churn/cohorts/forecast/
  billing-ops/webhook-ops/usage-rollups/proration/org insights)
- `components/saas-ops/HealthTable.tsx`, `components/saas-ops/WebhookOpsPanel.tsx`
- `app/dashboard/admin/subscription-health/page.tsx`
- `app/dashboard/admin/billing-ops/page.tsx`
- `app/dashboard/admin/webhooks/page.tsx`

**Migration**
- `supabase/migrations/0043_saas_operations.sql`

**Docs**
- `docs/PHASE_39_SAAS_OPERATIONS_REPORT.md` (this file)

---

## 3. Files modified

- `tsconfig.base.json`, `apps/web/package.json` — `@hsi/saas-ops` registration.
- `apps/web/lib/billing/stripe.ts` — `sdkUpdateSubscriptionPlan` (proration).
- `apps/web/lib/billing/sync.ts` — shared `dispatchStripeEvent` + `recordDeadLetter`.
- `apps/web/app/api/webhooks/stripe/route.ts` — uses shared dispatcher + dead-letter.
- `apps/web/app/dashboard/admin/revenue/page.tsx` — trend/movement/forecast/cohorts.
- `apps/web/app/dashboard/org/billing/page.tsx` — insights section (owners).
- `apps/web/lib/launch/migration-audit.ts` + `.test.ts` — registry `0043`, length 43.
- `packages/ui/src/navigation.tsx`, `packages/ui/src/nav-roles.ts`,
  `apps/web/components/admin/AdminNav.tsx`, `apps/web/lib/navigation/routes.ts` — nav.
- `pnpm-lock.yaml`, `apps/web/tsconfig.tsbuildinfo` — toolchain.

> No `middleware.ts`, `lib/auth/*`, `rbac-audit.ts`, `user_roles`, or IAM DAL changes.

---

## 4. Migration summary (`0043`)

| Object | Type | Access |
| --- | --- | --- |
| `revenue_snapshots` | table | admin-only (platform analytics + diff basis) |
| `churn_events` | table | admin-only (per-org churn history) |
| `cohort_snapshots` | table | admin-only |
| `subscription_health` | table | member read (own org) + admin all |
| `usage_rollups` | table | member read (own org) + admin all |
| `webhook_deadletters` | table | admin-only; unique `stripe_event_id` (replay-safe) |
| `subscription_health`, `webhook_deadletters` | trigger | `set_updated_at` |

RLS reuses `is_admin`/`is_org_member`. Additive (0001–0042 untouched), idempotent
(`if not exists`, `drop policy if exists`). Webhook dead-letters write via the
service-role (server-only) inside the webhook route.

---

## 5. Revenue analytics architecture

```
organization_subscriptions + plans + organization_usage
        │  loadOpsSubscriptions → OpsSubscription[] (mrr via @hsi/billing pricing)
        ▼
@hsi/saas-ops.computeRevenueMetrics(subs, priorMrrByOrg)
        │  diff vs latest revenue_snapshots.mrr_by_org
        ├── MRR / ARR / growthRate
        ├── expansion (org MRR ↑) / contraction (↓, still paying) / churned (→0)
        └── netNew = expansion − contraction − churned
        ▼
snapshot → revenue_snapshots (mrr + mrr_by_org basis for next diff)
        ▼
/dashboard/admin/revenue  ── trend sparkline (snapshot history) + movement cards
computeForecast(mrrHistory, churnRate) → next-month MRR, next-quarter ARR
```

MRR counts active + past-due only (trials excluded). Movement is computed against
the most recent snapshot, so each load advances the series.

---

## 6. Churn & health model

- **Health (0–100, higher = healthier):** active users (25), login recency (20),
  usage trend (20), content + investigation + publication activity (35) →
  `healthy ≥65 · warning ≥40 · at-risk <40`. Persisted per-org to
  `subscription_health`.
- **Churn (0–100, higher = riskier):** declining usage (≤35), inactivity (≤30),
  payment failures (15 each, ≤30), expiring trial (15) →
  `high ≥60 · medium ≥30 · low <30`. History in `churn_events`; aggregate churn
  rate = high-risk share, fed into the forecast.
- Both are pure + deterministic (factors passed in), validated by unit tests.

---

## 7. Forecasting model

Simple, explainable, and overrideable by actuals:

- `trailingGrowthRate` = average per-step growth across the MRR snapshot window.
- `nextMonthMrr = current × (1 + growth − churnRate)`, split into
  `growthProjection` and `churnProjection`.
- `nextQuarterArr = current × (1 + (growth − churn))³ × 12`.

Inputs are the `revenue_snapshots` MRR history and the high-risk share from
`churn_events`. No clocks in the engine; the DAL supplies the series.

---

## 8. Security review

- **No RBAC/auth/middleware/user_roles/IAM changes** — confirmed by `git status`.
- **Stripe secrets server-only** — only `lib/billing/stripe.ts` reads them; greps
  confirm none in client components or pages; no client imports the SDK boundary or
  `getServiceClient`.
- **No service-role key in client code** — admin DALs use the RLS admin client +
  `requireAdmin`; webhook replay runs under the admin RLS client (admin policies),
  the webhook route uses the server-only service client (same boundary as Phase 38).
- **Tenant isolation** — `subscription_health`/`usage_rollups` are member-read per
  org; revenue/churn/cohort/dead-letter tables are admin-only.
- **Webhook replay safety** — replays reuse the shared `dispatchStripeEvent` (same
  idempotent path as live delivery); `decideReplay` caps attempts; dead-letters keyed
  by unique event id.
- **Proration** — previewed in HSI, applied by Stripe (source of truth), reflected
  via sync; every change audited to `billing_audit_log`. Overages are tracking-only.

---

## 9. Verification results

| Gate | Result |
| --- | --- |
| Web typecheck | ✅ 0 errors |
| Worker typecheck | ✅ 0 errors |
| `@hsi/saas-ops` typecheck | ✅ 0 errors |
| Full test suite | ✅ **2577 pass / 0 fail** (+20) |
| Production build | ✅ success; revenue, subscription-health, billing-ops, webhooks all emitted |
| Route audit | ✅ passed (189 pages) |
| Migration audit | ✅ contiguous 0001→0043 |
| Revenue calculations validated | ✅ expansion/contraction/churn/growth tests |
| Churn calculations validated | ✅ risk-tier + factor tests |
| Cohort calculations validated | ✅ retention/engagement grouping tests |
| Webhook replay safety validated | ✅ `decideReplay` + dead-letter summary tests |
| No RBAC / auth changes | ✅ confirmed via git status + grep |

---

## 10. Remaining gaps for Phase 40 (white-label expansion)

1. **Scheduled automation** — a worker job to run `computeUsageRollupsAction`,
   refresh health/churn, and snapshot revenue on a cron (today they compute on view).
2. **Real activity signals** — wire health/churn `usageTrend`/`daysSinceLogin` to
   actual event telemetry rather than usage-counter proxies.
3. **White-label runtime** — render `organization_branding` (Phase 37) across the
   app: per-tenant theme, logo, custom domains (entitlement already exists).
4. **Dunning + lifecycle emails** — automated past-due cadence and trial-conversion
   nudges driven by churn/health.
5. **Cohort depth** — multi-period retention curves and revenue-weighted cohorts.
6. **Forecasting upgrade** — seasonality / confidence intervals beyond the linear
   model.
7. **Webhook ops hardening** — alerting on dead-letter growth, bulk replay, and a
   scheduled auto-retry with backoff.
8. **Enterprise reporting** — exportable executive SaaS metrics (CSV/PDF) and
   per-tenant billing statements.
