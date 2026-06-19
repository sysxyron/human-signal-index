# Phase 69 — Intelligence Marketplace

**Status:** Complete (uncommitted)
**Routes:** `/marketplace` · `/marketplace/[slug]` · `/marketplace/publishers/[id]` (public) · `/dashboard/marketplace` (admin) · `/api/public/marketplace` (public, rate-limited)
**Migration:** `0055_intelligence_marketplace.sql` (additive)

A commercial / distribution layer that **packages, catalogs, discovers, licenses,
and distributes** intelligence already produced by HSI. It does **not** create
intelligence — every product links back to real assets (sources, evidence,
narratives, forecasts, corrections) for provenance. No AI-generated products, no
synthetic reports, no fabricated numbers. **No payments / Stripe / checkout** —
only schema-ready commerce hooks.

This phase modifies **no** ingestion / review / publication / evidence / narrative
/ forecast / monitoring / notification / agent workflow.

---

## Architecture

```
lib/marketplace/
  types.ts        PURE — product/asset vocabulary, labels, slugify, avgRating
  persistence.ts  DAL — products/versions/assets/publishers/categories/ratings/favorites/downloads
  service.ts      RBAC API — public reads (published-only), admin mutations, authed engagement
  data.ts         cached catalog + live product detail + publisher profile
  actions.ts      publish/archive/feature/pin/version/publisher (admin, audited) + favorite/rate + view/download

app/(marketing)/marketplace/page.tsx               Catalog (Deliverable 1)
app/(marketing)/marketplace/[slug]/page.tsx        Product detail (D4)
app/(marketing)/marketplace/publishers/[id]/page.tsx  Publisher profile (D7)
app/dashboard/marketplace/page.tsx                 Admin console (D10)
app/api/public/marketplace/route.ts                Public API (D11, rate-limited)
components/marketplace/                             panels (server) + engagement + admin (client)
supabase/migrations/0055_intelligence_marketplace.sql  9 tables, seeded categories, RLS
```

Public catalog reads go through `readPublicClient` (service-role) with
**published-only enforced in code**; authed favorite/rate use the cookie RLS
client; admin writes use the admin/service-role client. Catalog is cached
(`unstable_cache`); product detail is live (analytics + view logging).

---

## Product model

`marketplace_products`: slug, title, summary, description, **product_type** (8),
category, publisher, status (`draft/published/archived`), featured, pinned,
version, computed `source/evidence/narrative/forecast_count` + `provenance_summary`,
and **schema-ready commerce hooks** `license_type / price_tier /
subscription_tier / access_policy` (no logic). Versions tracked in
`marketplace_versions`; provenance links in `marketplace_product_assets`.

**Product types (seeded as categories):** `RESEARCH_REPORT · FORECAST_PACKAGE ·
WATCHLIST · SOURCE_COLLECTION · NARRATIVE_PACKAGE · EVIDENCE_COLLECTION ·
MONITORING_FEED · EXECUTIVE_BRIEF`.

**Asset (provenance) types:** `SOURCE · SIGNAL · EVIDENCE · NARRATIVE · FORECAST ·
PUBLICATION · GRAPH_NODE · WATCHLIST · CORRECTION`.

---

## Publisher model

`marketplace_publishers` (name, slug, bio, verified, owner). The public publisher
profile computes — never fabricates — product count, total downloads, average
rating, and **forecast accuracy** (from the publisher's products' linked forecasts
→ `forecast_scores`; `null` when there are no forecasts).

---

## Provenance / transparency integration

A product's `source/evidence/narrative/forecast/publication/correction` counts are
computed from its real asset links (`countAssets`). The detail page surfaces these
plus direct links into the Phase 68 **Transparency Portal**
(`/transparency/{sources,narratives,forecasts,corrections,methodology}`) — so a
buyer can trace any product to source reliability, narrative evolution, forecast
outcomes, and the correction ledger. No storage or calculation is duplicated; the
marketplace only links.

---

## Analytics

Real counters only: `marketplace_downloads` (with `kind` = download/view),
`marketplace_favorites`, `marketplace_ratings` (1–5 + review). The detail page
shows downloads, views, favorites, and average rating + count — all aggregated
from real rows. No synthetic popularity. "Trending" ranks published products by
real engagement (`downloads + favorites×2`).

---

## Security model

- **Public:** read the catalog + published product detail + publisher profiles;
  the public API is anonymous-safe and **rate-limited** (60/min/client) with cache
  headers and graceful degradation. RLS exposes **only published** products
  (`status='published' OR is_admin()`); versions/assets are gated to published
  parents; drafts never leak.
- **Authenticated users:** favorite + rate (RLS owner-scoped: `auth.uid() = user_id`).
- **Admins:** publish / archive / feature / pin / version + create publishers
  (admin RLS; audited via `recordSecurityAudit`).
- No service-role exposure to the client; no auth bypass; no unpublished leakage.

---

## Future monetization architecture

Commerce hooks are **schema-ready, logic-free**: `license_type`, `price_tier`,
`subscription_tier`, `access_policy` on every product. A future commerce phase can
add checkout/billing (e.g. reuse the existing Stripe infra from Phases 38–43)
against these fields without touching the catalog, provenance, or transparency
wiring. Access enforcement would gate on `access_policy` / `subscription_tier`;
nothing here presumes a payment model.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Marketplace + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2758 / 2758** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; all 5 routes `ƒ` |
| Migration idempotency | ✅ re-runnable (if-not-exists + seed on-conflict + drop-policy) |
| No workflow changes / no AI products / no fabricated numbers / no Stripe | ✅ distribution layer only |

> Migrations `0048`–`0055` must be applied to Supabase. The catalog is empty until
> an admin publishes products (packaging existing intelligence); it degrades to
> empty states gracefully.

---

## Success criteria

- **An organization can publish** an intelligence product (admin console at
  `/dashboard/marketplace`, packaging real assets with provenance links).
- **A user can discover** it (catalog, search, category filters, trending) and
  **inspect provenance** (computed counts + transparency links → narratives,
  forecasts, corrections, source reliability) — everything traceable back to the
  original intelligence assets. No black boxes.
