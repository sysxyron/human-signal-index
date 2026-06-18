# Phase 56.1 — Security Remediation Implementation

Implements the approved remediations from `docs/PHASE_56_SECURITY_HARDENING_AUDIT.md`.
Scope-limited to the documented findings — no new features, no schema/workflow/review
changes.

## Files modified

| File | Change | Audit finding |
|---|---|---|
| `apps/web/next.config.mjs` | Added `headers()` with 6 security headers (CSP report-only) | H1 (Security Headers FAIL) |
| `apps/web/lib/security/rbac-audit.ts` | Added `/dashboard/forecasting`, `/dashboard/watchlists`, `/dashboard/signal-intake` (researcher) to `PROTECTED_ROUTES` | R1 (Authorization WARNING) |
| `packages/ui/src/nav-roles.ts` | NAV_VISIBILITY entries for the 3 routes; signal-intake → +curator (consistency) | R1 |
| `apps/web/lib/security/rbac-audit.test.ts` | +1 test asserting the new route gates | R1 |
| `apps/web/lib/trust-intelligence.ts` | Replaced 3 hardcoded scorecard/overview metrics with computed values (or null) | T1–T3 (Platform Trust WARNING) |
| `apps/web/components/trust-center/panels.tsx` | Render `null` metrics as "Not enough data yet" | T1–T3 |
| `apps/web/lib/release-readiness.ts` | Handle nullable trust metrics (human review / transparency score) | T1–T3 |
| `apps/web/lib/api-rate-limit.ts` | **New** — NextResponse adapter over the pure limiter | L2/L3 (Rate Limiting WARNING) |
| `apps/web/app/api/health/{rest,auth,storage,supabase}/route.ts` | Rate-limited (30/min/IP, shared `health` bucket) | L2 |
| `apps/web/app/auth/confirm/route.ts` | Rate-limited (10/min/IP) on OTP verification | L3 |

No external infrastructure added; the existing in-memory limiter is reused.

---

## 1. Security Headers — FAIL → PASS

`next.config.mjs` now returns headers for `source: '/:path*'`. CSP ships
**Report-Only** so it cannot break Supabase auth, Vercel, Resend, Cloudflare, Stripe,
or existing inline scripts/styles (Next + framer-motion) — it only reports
violations; promote to enforcing `Content-Security-Policy` once the report stream is
clean. The other five headers are enforced immediately.

### Header matrix (before → after)

| Header | Before | After | Mode |
|---|:---:|:---:|---|
| Content-Security-Policy | ✗ | ✓ | **Report-Only** (allows Supabase `*.supabase.co` + `wss`, Stripe, Vercel insights; `'unsafe-inline'/'unsafe-eval'` retained until nonce follow-up) |
| X-Frame-Options | ✗ | ✓ `DENY` | Enforced |
| X-Content-Type-Options | ✗ | ✓ `nosniff` | Enforced |
| Referrer-Policy | ✗ | ✓ `strict-origin-when-cross-origin` | Enforced |
| Permissions-Policy | ✗ | ✓ `camera=(), microphone=(), geolocation=(), browsing-topics=()` | Enforced |
| Strict-Transport-Security | ✗ | ✓ `max-age=63072000; includeSubDomains; preload` | Enforced (HTTPS) |

**Follow-up (not blocking):** introduce a CSP nonce and drop `'unsafe-inline'`/
`'unsafe-eval'`, then flip CSP from Report-Only to enforcing.

---

## 2. Trust Center Metric Accuracy — WARNING → PASS

All three hardcoded values replaced with computations from real data; where the
underlying data isn't collected, the UI shows **"Not enough data yet"** (never a
fabricated number). `TransparencyScore.pct` and `TrustOverviewData.humanReviewedPct`
are now `number | null`.

### Calculation logic (after)

| Metric | Before | After |
|---|---|---|
| **Human Reviewed** | `pubN > 0 ? 100 : 0` | `% of published with an approving review_status` (regex `approv\|review\|clear\|publish\|pass\|accept`) over those that carry a review_status; **null** ("Not enough data yet") when none do |
| **Version Controlled** | `pubN > 0 ? 100 : 0` | **null** — no per-publication version metadata is collected yet (honest "Not enough data yet") |
| **Corrections Logged** | `pubN > 0 ? 100 : 0` | `min(100, corrections ÷ archived/retracted count)` — share of pulled-back items with a public correction; **null** when nothing is archived |
| Evidence Linked / Traceable / Source Verified | computed | unchanged (still computed; now null-safe when denominators are 0) |

Downstream `release-readiness.ts` updated: "Human review" and "Transparency score"
render "Not enough data yet" when unmeasurable; **transparency score averages only
the measurable scorecard items** (null entries excluded, never counted as 0).

---

## 3. Route Authorization — WARNING → PASS

`/dashboard/forecasting`, `/dashboard/watchlists`, `/dashboard/signal-intake` were
reachable by any signed-in user. All three are now in `PROTECTED_ROUTES` at
`researcher` minimum, so **middleware enforces** them server-side; NAV_VISIBILITY was
updated to match (route access == nav visibility). A regression test asserts the gate.

### Route protection matrix (after)

| Route | Admin | Curator | Reviewer | Researcher | Contributor | Public |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/dashboard/forecasting` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/dashboard/watchlists` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/dashboard/signal-intake` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `/dashboard/source-registry` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `/dashboard/admin/*`, `/security*`, `/launch` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `/api/public/*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (rate-limited) |

(Contributor maps to viewer-rank for route gating; researcher+ required ⇒ contributor denied.)

---

## 4. Rate Limiting — WARNING → PASS

New `lib/api-rate-limit.ts` wraps the existing pure in-memory limiter and returns a
429 (`retry-after`, `cache-control: no-store`) when exceeded — **no external
infrastructure**.

### Rate-limit coverage (after)

| Endpoint | Before | After |
|---|---|---|
| `/api/public/intelligence` | 60/min/IP | unchanged |
| `/api/public/trust` | 60/min/IP | unchanged |
| `/api/health/{rest,auth,storage,supabase}` | none | **30/min/IP** (shared `health` bucket) |
| `/auth/confirm` (OTP verify) | none (GoTrue only) | **10/min/IP** → friendly `/auth/error?reason=rate-limited` |
| `/api/cron/source-capture` | secret-gated | unchanged (secret; per-IP limit noted as optional follow-up) |
| `/api/webhooks/stripe` | signature + idempotent | unchanged |

**Known limitation (documented):** the limiter is per-server-instance (in-memory);
for a high-traffic serverless fleet a shared store (Upstash/Vercel KV) remains a
recommended future upgrade. Behavior for existing callers is preserved (limits are
generous; only abusive bursts hit 429).

---

## Updated readiness scorecard

| Domain | Phase 56 | Phase 56.1 |
|---|---|---|
| Authentication | PASS | **PASS** |
| Authorization | WARNING | **PASS** |
| Public APIs | PASS | **PASS** |
| Data Protection | PASS | **PASS** |
| Rate Limiting | WARNING | **PASS** |
| Platform Trust | WARNING | **PASS** |
| Dependency Health | PASS | **PASS** |
| Security Headers | FAIL | **PASS** (CSP report-only; enforce after nonce follow-up) |

### Overall recommendation: **READY FOR EXPANDED BETA**

Residual non-blocking follow-ups: (a) promote CSP from Report-Only to enforcing once
the violation stream is clean (requires a nonce strategy); (b) migrate the rate
limiter to a shared store before high public traffic.

---

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json` — **clean (exit 0)**.
- `tsx --test` over all `*.test.ts` (chunked) — **2669 / 2669 pass, 0 fail** (+1 new RBAC test).
- `next build` (apps/web, clean `.next`) — **exit 0, "Compiled successfully"**.

(The repo has no `pnpm typecheck`/`pnpm test` scripts; canonical commands above.)

Note: a nav invariant test (`every restricted route is a real menu item`) initially
caught the new `NAV_VISIBILITY` keys — fixed by adding `/dashboard/forecasting` and
`/dashboard/watchlists` to `ALL_NAV_HREFS`, keeping route gate ↔ nav visibility ↔ menu
inventory consistent.
