# Phase 73.1 — Beta & Demo Conversion Landing Pages

**Status:** Complete (uncommitted) · **Type:** Additive (marketing only)
**Routes:** `/beta`, `/demo` (public) · APIs `/api/beta/apply`, `/api/demo/request`
**No auth, dashboard, or workflow changes.**

Two focused conversion pages on the public marketing site, added ahead of Phase 74.
`/beta` recruits beta testers; `/demo` converts serious buyers/partners into demo
requests. `app.humansignalindex.org` remains the product login/app — no new domain.

---

## 1. Why /beta and /demo were added

The homepage explains the mission but had no dedicated conversion path. `/beta`
and `/demo` separate the two distinct intents — *try it* (testers, email/onboarding
first) vs *buy/partner* (institutions, phone-close first) — each with tailored
copy, audiences, and a working form.

## 2. Architecture audit (reuse)

- **Routing:** App-Router marketing group `app/(marketing)/*` (e.g. `contact`,
  `subscribe`). Added `beta/` and `demo/` there → `/beta`, `/demo`.
- **Design system:** `PageHeader`/`Section` (`components/page-header`), `Card`,
  `Button`, `Input`, `Select`, `Textarea`, `SectionEyebrow` (`@hsi/ui`), lucide
  icons, the dark theme tokens — all reused; no new styles.
- **Metadata:** `export const metadata: Metadata` with `alternates.canonical` +
  `openGraph`, matching `contact`/other marketing pages.
- **App-domain links:** `appHref('/sign-in')` (`lib/env/app-url`) for the cross-
  origin app login, exactly as the marketing layout/homepage do.
- **Forms:** no generic marketing form backend existed (the contact form is a
  static `<form>`). So this phase adds two **safe placeholder** API routes +
  interactive client forms.

## 3. Files created

- `app/(marketing)/beta/page.tsx`, `app/(marketing)/demo/page.tsx`
- `app/api/beta/apply/route.ts`, `app/api/demo/request/route.ts`
- `components/marketing/BetaForm.tsx`, `components/marketing/DemoForm.tsx`
- `docs/PHASE_73_1_BETA_DEMO_CONVERSION_PAGES.md`

## 4. Files modified

- `app/(marketing)/page.tsx` — homepage CTA now links to `/beta` and `/demo`.

## 5. Routes added

`/beta`, `/demo` (public, responsive). APIs: `POST /api/beta/apply`,
`POST /api/demo/request`.

## 6. Form behavior

Controlled client forms POST JSON to the API routes. The API **validates required
fields** (beta: name, email, role, reason; demo: name, email, organization, use
case; both validate email format), returns `{ ok, message }` or `{ ok:false, error }`
with a 4xx, and is otherwise a **no-op success** — it does **not** persist or email
anyone yet. If the network/backend is unavailable, the form shows a clear message
plus a mailto fallback (beta@ / demo@humansignalindex.org) — **never a dead UX**.
No secrets are exposed. `TODO(backend)` comments mark where to wire Supabase /
Resend / CRM when infra is ready.

## 7. SEO metadata added

- `/beta` — Title: *Human Signal Index Beta | Help Test an Intelligence & Trust
  Analysis Platform*; description per spec; canonical `/beta`; OpenGraph.
- `/demo` — Title: *Request a Human Signal Index Demo | Evidence-Backed
  Intelligence Workflows*; description per spec; canonical `/demo`; OpenGraph.

## 8. Homepage routing changes

The final homepage CTA now offers **Apply to Beta** (`/beta`) and **Request a
Demo** (`/demo`) alongside *Explore Dashboard*, with *Submit a Signal* kept as a
secondary text link. Internal routing: Home → Beta/Demo; Beta ↔ Demo; Beta/Demo →
app sign-in (`appHref('/sign-in')`).

## 9. Copywriting summary

Serious, evidence-first, no hype. Vocabulary: *evidence-backed, public-source
focused, human-reviewed, provenance-aware, transparent workflows, forecast
accountability, correction tracking*. Avoids "replaces analysts" / "guarantees
truth" / black-box claims. `/beta` = participatory ("help test", founding tester
recognition, protected feedback); `/demo` = buyer-oriented ("provenance you can
defend", use cases, what a demo covers, pilot next steps).

## 10. Conversion strategy & segmentation

- **Traffic strategy:** homepage CTA + cross-links + SEO titles target intent
  keywords ("beta", "demo", "evidence-backed intelligence workflows").
- **/beta (users):** researchers, OSINT, journalists, policy watchers, T&S,
  nonprofits, academics, mis/disinfo & extremism analysts, forecasting/public-trust
  researchers. Handle via **email/onboarding** first.
- **/demo (buyers/partners):** research orgs, OSINT teams, newsrooms, nonprofits,
  policy orgs, T&S teams, academic labs, enterprise intelligence teams,
  investigative teams. Route to the **phone-close** queue.

## Phone-close priority (recommendation)

Highest-priority phone/demo prospects, in order:

1. Research organizations
2. Nonprofits and investigative teams
3. OSINT teams
4. Trust & safety teams
5. Policy organizations
6. Academic labs
7. Journalists / newsroom editors
8. Enterprise intelligence teams

Beta testers can be handled by email/onboarding first. Phone calls should focus on
buyers, partners, institutions, and team leads who can approve pilots, budgets,
partnerships, or organizational adoption.

## 11. Future improvements

- Wire a real backend (Supabase table → Resend notification → CRM lead) behind the
  two `TODO(backend)` markers; route demo requests to the phone-close queue.
- Add spam protection (honeypot / rate-limit via the existing `lib/rate-limit`).
- A/B test headlines; add a logo/social-proof strip once partners are public.
- Optional: a calendar embed on `/demo` for self-scheduling.

## Testing checklist

- [ ] `/beta` and `/demo` render and are responsive (mobile → desktop).
- [ ] Beta form: missing fields → inline error; valid → success state.
- [ ] Demo form: missing fields → inline error; valid → success state.
- [ ] Backend down (offline) → friendly error + mailto fallback, no crash.
- [ ] Homepage CTA links to `/beta` and `/demo`; cross-links + app sign-in work.
- [ ] SEO titles/descriptions/canonical present (view source / metadata).
- [ ] `tsc` clean · full test suite green · `next build` succeeds.

## Verification results

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Full test suite (tracked + untracked) | ✅ (see report) |
| `next build` (clean `.next`) | ✅ `/beta` + `/demo` present |
| No auth / dashboard / workflow changes | ✅ |

Left **uncommitted** per your standing preference.
