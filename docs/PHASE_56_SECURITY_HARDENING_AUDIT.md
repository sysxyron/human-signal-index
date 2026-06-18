# Phase 56 — Security Hardening & Platform Audit

**Type:** Read-only audit. **No code, schema, workflow, or feature changes were made
in this phase.** All issues below are findings + remediation *recommendations* only;
nothing was auto-implemented (per scope discipline).

**Scope:** authentication, RBAC/authorization, public APIs & data exposure, database
access (RLS/service-role/anon), security headers, rate limiting, secret exposure,
trust-metric accuracy, dependencies — across `apps/web`, `packages/*`, and
`supabase/migrations`.

**Method:** six parallel read-only audits with file:line evidence, synthesized here.

---

## Executive result

| Domain | Score | One-line |
|---|---|---|
| Authentication | **PASS** | Supabase SSR, DB-canonical roles, no token leakage; minor hardening items |
| Authorization (RBAC) | **WARNING** | Middleware enforces most routes; 3 new read-only routes not role-gated |
| Public APIs | **PASS** | Only published/aggregate data; no PII/identities/notes |
| Data Protection (DB + secrets) | **PASS** | RLS on all tables; service-role server-only; no secrets in client |
| Rate Limiting | **WARNING** | Public APIs limited; in-memory (per-instance); auth/health unlimited |
| Platform Trust | **WARNING** | 3 Trust-Center scorecard metrics hardcoded, not computed |
| Security Headers | **FAIL** | No CSP / X-Frame-Options / HSTS / etc. configured |
| Dependency Health | **PASS** | Next 14.2.5, React 18.3.1, Supabase current; no known critical advisories |

### Final recommendation: **REQUIRES REMEDIATION** before expanding beyond the current cohort

The platform is fundamentally sound (auth, RBAC core, data protection, public-API
exposure, secrets all PASS). Three remediations should land before *expanded* beta:

1. **Security headers (FAIL)** — add a `headers()` block to `next.config.mjs`.
2. **Trust-Center metric accuracy (WARNING)** — compute or relabel the 3 hardcoded
   scorecard percentages so the Trust Center makes no unsupported claims.
3. **Authorization (WARNING)** — role-gate (or explicitly confirm public intent for)
   `/dashboard/forecasting`, `/dashboard/watchlists`, `/dashboard/signal-intake`.

None are blockers for the *current* cohort; all are small, well-scoped fixes.

---

## 1. Authentication — PASS

Flows reviewed: sign-in, sign-up, email confirm (`app/auth/confirm/route.ts`), OAuth
callback (`app/auth/callback/page.tsx`), password reset/update, sign-out, middleware
session refresh (`lib/supabase/middleware.ts`).

**Strengths:** anon key only on client; tokens never logged/rendered; service-role
isolated to `lib/admin/guard.ts` (server, dynamic import); session refreshed every
request via `@supabase/ssr` `getUser()`; role resolved from DB (`user_roles → roles`),
not the JWT; `next`/`redirectedFrom` validated against `//` for confirm + callback.

| # | Finding | Risk | Evidence | Recommended fix (not implemented) |
|---|---|---|---|---|
| A1 | OAuth `error_description` from provider is reflected into `?error=` redirect | **Medium** | `app/auth/callback/page.tsx:56-59` | Map provider error *codes* to safe messages; don't reflect raw description (rendered as text today, so not XSS — info-leak hardening) |
| A2 | `redirectedFrom` validated with `startsWith('/')` only in sign-in | **Low** | `app/(auth)/sign-in/page.tsx:59-61` | Also reject `://` and `//` (confirm/callback already do); defense-in-depth vs open-redirect |
| A3 | `/auth/sign-out` POST has no CSRF/origin check | **Low** | `app/auth/sign-out/route.ts` | Validate Origin or use a Server Action; sign-out is idempotent so impact is low |
| A4 | Role lookup failure (DB down) denies role-gated routes | **Low/Info** | `middleware.ts` role gate | Acceptable fail-closed; consider monitoring/alert on lookup errors |

No Critical/High. **Authentication: PASS.**

---

## 2. Authorization (RBAC) — WARNING

**Architecture (verified correct):** middleware (`middleware.ts` + `lib/security/rbac-audit.ts`
`requiredRoleForRoute` / `PROTECTED_ROUTES`, longest-prefix-wins) enforces role gates
server-side at the edge; role from `loadHighestRole` (DB). Role ranks: viewer 1 →
researcher 2 → reviewer 3 → curator 4 → admin 5. `nav-roles.ts` is UX-only (verified —
not the security boundary). Admin/compliance/cron/stripe endpoints are correctly gated
(admin guard / cron secret / signature).

### Route → role access matrix (key routes)

| Route | Admin | Reviewer | Researcher | Contributor | Public | Gate |
|---|:---:|:---:|:---:|:---:|:---:|---|
| `/dashboard` | ✓ | ✓ | ✓ | ✓ | ✗ | middleware (auth only) |
| `/dashboard/source-registry` | ✓ | ✓ | ✗ | ✗ | ✗ | middleware (`PROTECTED_ROUTES`, reviewer) |
| `/dashboard/my-work` | ✓ | ✗ | ✓ | ✗ | ✗ | page `canResearch` + middleware |
| `/dashboard/collaboration` | ✓ | ✗ | ✓ | ✗ | ✗ | page `canResearch` + middleware |
| `/dashboard/release-candidate` | ✓ | ✗ | ✓ | ✗ | ✗ | page `canResearch` + middleware |
| `/dashboard/contributors` | ✓ | ✗ | ✓ | ✗ | ✗ | page `mayView` + middleware |
| `/dashboard/beta-operations` | ✓ | ✗ | ✗ | ✗ | ✗ | page `isAdmin` (self-gated) |
| **`/dashboard/forecasting`** | ✓ | ✓ | ✓ | **✓** | ✗ | **none (any signed-in user)** |
| **`/dashboard/watchlists`** | ✓ | ✓ | ✓ | **✓** | ✗ | **none (any signed-in user)** |
| **`/dashboard/signal-intake`** | ✓ | ✓ | ✓ | **✓** | ✗ | **none (any signed-in user)** |
| `/dashboard/admin/*`, `/dashboard/security*`, `/dashboard/launch` | ✓ | ✗ | ✗ | ✗ | ✗ | middleware (admin) |
| `/api/public/intelligence`, `/api/public/trust` | ✓ | ✓ | ✓ | ✓ | ✓ | public (rate-limited) |
| `/api/admin/compliance/export` | ✓ | ✗ | ✗ | ✗ | ✗ | `requireAdmin` + audited |
| `/api/cron/source-capture` | secret | — | — | — | — | `CRON_SECRET` (timing-safe) |
| `/api/webhooks/stripe` | sig | — | — | — | — | Stripe signature + idempotency |

| # | Finding | Risk | Evidence | Recommended fix (not implemented) |
|---|---|---|---|---|
| R1 | `/dashboard/forecasting` (52), `/dashboard/watchlists` (51), `/dashboard/signal-intake` not in `PROTECTED_ROUTES` → reachable by **any signed-in user incl. viewer/contributor** | **Medium** | `lib/security/rbac-audit.ts` PROTECTED_ROUTES (absent); pages have no `canResearch`/`canReview` gate | Decide intent. If researcher+/reviewer+: add to `PROTECTED_ROUTES` + `NAV_VISIBILITY`. Data shown is public-safe aggregates, so exposure impact is low, but intent should be explicit. |
| R2 | `/dashboard/signal-submission` is in `NAV_VISIBILITY` (reviewer/curator) but **not** in `PROTECTED_ROUTES` | **Low** | `nav-roles.ts:30` vs `rbac-audit.ts` | If the page exists/handles submissions, add to `PROTECTED_ROUTES` so middleware enforces (nav-hide ≠ gate). |
| R3 | `/api/cron/source-capture` has no per-IP rate limit (secret-gated only) | **Low/Medium** | `app/api/cron/source-capture/route.ts:38-48` | Add light per-IP limit; rotate `CRON_SECRET`; monitor invocation rate. |
| R4 | No CI check that every `PROTECTED_ROUTES` entry has a matching `NAV_VISIBILITY` entry (drift risk for new routes) | **Low** | — | Add a test asserting parity so future routes can't silently ship ungated. |

No Critical/High. **Authorization: WARNING** (R1 is the one to action before expanded beta).

---

## 3. Public APIs & Data Exposure — PASS

Endpoints: `GET /api/public/intelligence`, `GET /api/public/trust` (both rate-limited,
`force-dynamic`, never 500). Full field inventory walked.

**Verified absent from both responses:** reviewer/admin identities, source names/URLs,
`created_by`/user ids, internal/moderation notes, retraction `detail`, `retracted_by`,
raw un-published intelligence, emails/PII. The corrections feed exposes only
`reason → title-cased type` + status + resolution (no `detail`/`retracted_by`). Signal
activity events use the **category** only (never raw signal titles). No `select('*')`
reaches the wire for these endpoints.

| # | Finding | Risk | Evidence | Note / recommended action |
|---|---|---|---|---|
| P1 | Activity feed + corrections include **published-publication titles** | **Info/Low** | `lib/public-intelligence.ts` (REPORT PUBLISHED / EVIDENCE LINKED text); `lib/trust-intelligence.ts` corrections `publication` | **By design** — these titles already render publicly on `/research-reports` and `/intelligence/[slug]`. Confirm intent; if any publication state should be private, gate it. No PII. |
| P2 | `latestSignals` may surface published `hsin_signals` titles (when present) | **Info** | `lib/public-intelligence.ts` loadLatestSignals | Only `status='published'` signals (public via RLS). Acceptable. |

No PII/identity/internal-data leakage found. **Public APIs: PASS** (P1 is an
intent-confirmation, not a leak).

---

## 4. Data Protection — DB + Secrets — PASS

**RLS (migrations):** enabled on all tables. Anon read is restricted to public content
only — `hsin_publications` (`state in ('PUBLISHED','RETRACTED')`), published
`hsin_signals`, `hsin_publication_retractions` (world-readable for transparency),
`category_taxonomy`/`tags`. **No anon access** to `users`, `user_roles`, `roles`,
`evidence_items`, `uploaded_files`, `security_events`, `audit_logs`,
`hsin_signal_reviews`, `hsin_sources`.

**Service-role usage** (RLS-bypass) is **server-only** in: `lib/public-intelligence.ts`
(aggregate counts, head:true), `lib/beta-operations.ts` (admin-only user/role counts —
no emails/names), `lib/admin/guard.ts` (admin IAM, dynamic import), seed scripts (CLI).
None imported by `'use client'` modules.

**Secrets:** only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` are public. `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`DATABASE_URL`, `CRON_SECRET` are server-only. `lib/env/validate-env.ts` actively flags
any `NEXT_PUBLIC_*(SERVICE_ROLE|SECRET|PRIVATE)*` at startup. Stripe SDK is lazily
dynamic-imported (not bundled to client).

| # | Finding | Risk | Recommended action |
|---|---|---|---|
| D1 | Aggregate counts of internal tables exposed via service-role reads (counts only, no rows/PII) | **Low/Info** | Documented contract is good; keep the count-only guarantee as code evolves. |
| D2 | `validate-env` secret regex doesn't catch `NEXT_PUBLIC_*TOKEN`/`*PASSWORD` | **Very Low** | Broaden the regex to include `TOKEN|PASSWORD|KEY`. |

No Critical/High/Medium. **Data Protection: PASS.**

---

## 5. Security Headers — FAIL

`apps/web/next.config.mjs` has **no `headers()` block**; `middleware.ts` sets none.

| Header | Present | Recommended value |
|---|:---:|---|
| Content-Security-Policy | ✗ | restrict `default-src 'self'`; `frame-ancestors 'none'` (tune for Supabase/Vercel/inline) |
| X-Frame-Options | ✗ | `DENY` (or rely on CSP `frame-ancestors`) |
| X-Content-Type-Options | ✗ | `nosniff` |
| Referrer-Policy | ✗ | `strict-origin-when-cross-origin` |
| Permissions-Policy | ✗ | `camera=(), microphone=(), geolocation=()` |
| Strict-Transport-Security | ✗ | `max-age=31536000; includeSubDomains; preload` |

**Finding H1 — Risk: High.** No defense against clickjacking, MIME-sniffing, or
referrer leakage; no CSP. **Recommended fix (not implemented):** add an `async
headers()` returning the six headers above for `source: '/(.*)'` in `next.config.mjs`
(CSP should be introduced in report-only mode first to avoid breaking inline styles /
framer-motion / Supabase). This is the single highest-value remediation.

**Security Headers: FAIL.**

---

## 6. Rate Limiting — WARNING

`lib/rate-limit.ts` = in-memory fixed-window (60/min/IP, `x-forwarded-for`-aware).
Applied to `/api/public/intelligence` + `/api/public/trust` (429 + `retry-after`).
CORS: none set anywhere → same-origin by default (no wildcard) ✓.

| # | Finding | Risk | Recommended fix (not implemented) |
|---|---|---|---|
| L1 | Limiter is **per-server-instance** (no shared store) — ineffective across a serverless fleet | **Medium** (scale) | Move to a shared store (Upstash/Redis or Vercel KV) before high-traffic public exposure. Documented as best-effort today. |
| L2 | `/api/health/*` unauthenticated + unlimited | **Medium** | Add a light limit (e.g., 30/min/IP) or restrict to monitoring infra. |
| L3 | `/auth/confirm` (OTP) + password-reset email have no app-level limit | **Medium** | Supabase GoTrue rate-limits server-side; add app-level limits as defense-in-depth for token/enumeration abuse. |
| L4 | Cron endpoint no per-IP limit | **Low** | See R3. |

**Rate Limiting: WARNING.**

---

## 7. Sensitive-Information Scan — PASS

Grep for `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET`, `secret`,
`token`, `password`, `apikey` across the repo: no secret value is committed or referenced
from a client bundle. All secret env vars are server-only (§4). The only `NEXT_PUBLIC_*`
vars are non-secret. **No secrets exposed to client bundles.**

---

## 8. Trust & Transparency Validation — WARNING

Forecasting (`lib/forecasting-intelligence.ts`) and Contributor Network
(`lib/contributor-network.ts`) verified **accurate and explainable**: 7/30/90-day
momentum is computed from real `publishedAt` timestamps; the confidence model is
transparent (sample size + continuity, with reason strings); early warnings are
conditional on observed indicators; reputation tiers are descriptive criteria; no
per-user PII is surfaced. **No fabricated forecasts.**

However, three **Trust Center scorecard** values are **hardcoded constants, not
computed** — a concern for a surface whose whole purpose is verifiable trust:

| # | Finding | Risk | Evidence | Recommended fix (not implemented) |
|---|---|---|---|---|
| T1 | `humanReviewedPct` returns `100` whenever ≥1 publication exists (no per-item review check) | **Medium** | `lib/trust-intelligence.ts` (`humanReviewedPct: pubN > 0 ? 100 : 0`) | Compute from `reviewStatus === 'approved'` (or governance decision rows), or relabel to a policy statement rather than a measured %. |
| T2 | Scorecard "Version Controlled" = `100%` if any published (no version data queried) | **Medium** | `lib/trust-intelligence.ts` scorecard | Either query real version metadata or present as a policy guarantee (not a measured percentage). |
| T3 | Scorecard "Corrections Logged" = `100%` if any published (not linked to corrections) | **Medium** | `lib/trust-intelligence.ts` scorecard | Compute corrected-vs-published ratio from `hsin_publication_retractions`, or relabel. |

Correctly computed (no change needed): traceability % (avg `trust_score`), Evidence
Linked %, Traceable %, Source Verified %, corrections count.

**Platform Trust: WARNING.** (These are presented as percentages on a public Trust
page; they should be measured or clearly framed as policy, to honor "no fabricated
metrics.")

---

## 9. Dependency Review — PASS

| Package | Version | Note |
|---|---|---|
| next | 14.2.5 | Stable; later 14.2.x patch releases exist — track but no known critical advisory blocking |
| react / react-dom | 18.3.1 | Current |
| @supabase/supabase-js | ^2 (2.10x) | Current |
| @supabase/ssr | ^0.5.2 | Current |
| framer-motion | ^11 | Current |
| lucide-react | ^0.484 | Current |
| tailwindcss | ^3.4 | Current |
| typescript | 5.9.3 | Current |
| eslint / @typescript-eslint | 9 / 7 | Current |

No outdated majors with known critical advisories. **Recommendation (not implemented):**
keep `next` on the latest 14.2.x patch and run `pnpm audit` in CI. **Dependency Health: PASS.**

---

## 10. Beta Expansion Readiness Score

| Domain | Score | Blocking for expanded beta? |
|---|---|---|
| Authentication | **PASS** | No |
| Authorization | **WARNING** | Address R1 (gate the 3 routes) — low effort |
| Public APIs | **PASS** | No |
| Data Protection | **PASS** | No |
| Rate Limiting | **WARNING** | L1/L2/L3 recommended before high-traffic public exposure |
| Platform Trust | **WARNING** | Fix/relabel T1–T3 (Trust Center is public-facing) |
| Dependency Health | **PASS** | No |
| Security Headers | **FAIL** | **Yes — add headers() before expanding** |

### Final recommendation: **REQUIRES REMEDIATION**

Pre-expanded-beta remediation set (all small, well-scoped; none touch RBAC/schema/
workflows):
1. **H1 — security headers** in `next.config.mjs` (CSP report-only first).
2. **T1–T3 — Trust Center metrics**: compute from data or relabel as policy.
3. **R1 — role-gate** `/dashboard/forecasting`, `/dashboard/watchlists`,
   `/dashboard/signal-intake` (or confirm public intent).

Then (before high public traffic): **L1** shared-store rate limiting, **L2/L3** limits
on health + auth-token routes. The current cohort can continue safely; no Critical/High
exploit was found in auth, data exposure, or secrets.

---

## Verification

This phase changed **no application code** (audit + this document only); the verification
confirms the tree remained green. The repo has no `pnpm typecheck`/`pnpm test` scripts —
the canonical commands are below (run as such):

- Typecheck: `tsc --noEmit -p apps/web/tsconfig.json` — **clean (exit 0)**.
- Tests: `tsx --test` over all `*.test.ts` (chunked) — **2668 / 2668 pass, 0 fail**.
- Build: `next build` (apps/web, clean `.next`) — **exit 0, "Compiled successfully"**.

Tree unchanged and green — confirming the audit introduced no regressions.
