# Phase 41B.2 — Public Website Content, UX & Accessibility Hardening

**Scope:** public marketing website only. No changes to RBAC, IAM, middleware, auth, user_roles, billing, Stripe, source ingestion, cron, signal capture, compliance, reviewer workflow, or the role-application workflow.

## 1. Executive summary

The public site was upgraded from a functional beta to a professional, accessible, research-grade presence. The About page was rebuilt with six full sections, a dedicated Mission page was added, Research Reports and the Education Hub were redesigned (and the broken "Open" buttons fixed), a native Accessibility Center was built (no third-party widget), header and footer navigation now show the active page, security and policy copy was cleaned up (plain English, fewer em dashes, corrected contact email), and SEO metadata + canonical URLs were standardized on the `www` marketing domain.

## 2. Files changed

**New**
- `app/(marketing)/mission/page.tsx` — Mission page (B).
- `app/(marketing)/accessibility/page.tsx` — Accessibility statement (H).
- `app/(marketing)/education-hub/[slug]/page.tsx` — article framework (F).
- `components/accessibility/AccessibilityWidget.tsx` — native a11y panel (H).
- `lib/education/guides.ts` — shared Education Hub guide catalog (F).

**Changed**
- `app/layout.tsx` — `metadataBase` → `www`, Open Graph + Twitter defaults (C, N).
- `app/(marketing)/layout.tsx` — mounts the Accessibility widget (H).
- `app/globals.css` — native accessibility styles + focus ring (H).
- `packages/ui/src/navigation.tsx` — active nav states (PublicNav + Footer); footer fixes (G, M).
- `app/(marketing)/about/page.tsx` — full rebuild, six sections (A).
- `app/(marketing)/research-reports/page.tsx` — redesign: categories, status/evidence cards, methodology, working Read links (E).
- `app/(marketing)/education-hub/page.tsx` — guide links replace disabled buttons (F).
- `app/(marketing)/signal-library/page.tsx` — copy + metadata (D, N).
- `app/(marketing)/transparency/page.tsx` — honest rewrite, removed fabricated stats + em dashes (I, O).
- `app/(marketing)/ethics/page.tsx`, `contact/page.tsx` — copy + metadata (J, K, N).
- `app/(marketing)/security/vulnerability-disclosure/page.tsx`, `security/responsible-disclosure/page.tsx`, `security-awareness/page.tsx`, `whistleblower/page.tsx`, `report-confidentially/page.tsx` — email fix + copy + metadata (L, N).
- `app/(marketing)/page.tsx`, `methodology/page.tsx`, `trust/page.tsx`, `submit-a-signal/page.tsx`, `public-reports/page.tsx` — copy + metadata (O, N).

## 3. Routes added

| Route | Purpose |
| --- | --- |
| `/mission` | Dedicated mission page (footer "Our Mission" points here, no redirect to About). |
| `/accessibility` | Accessibility statement + tool documentation. |
| `/education-hub/[slug]` | Article framework for each guide (structured placeholder, no fabricated content). |

## 4. Accessibility features added (H)

Native, no third-party widget. Floating button on every public page opens a panel with: **text size** (90–150%), **high-contrast mode**, **reduced motion**, **dyslexia-friendly font**, **keyboard-navigation help**, and **reset**. Preferences apply instantly via a CSS variable + classes on `<html>` and persist in `localStorage` (`hsi-a11y`). A persistent, visible focus ring is always on. The `/accessibility` page documents the tools and states a WCAG 2.1 AA intent and a reporting address. No data leaves the browser.

## 5. Domain-routing findings (C)

- The marketing layout already sends app CTAs ("Explore Dashboard", "Sign in") to `NEXT_PUBLIC_APP_URL` via `appHref()`, and keeps in-app links relative. This is correct.
- **No stray `app.humansignalindex.org` links** exist in marketing pages.
- **Root cause of the "lands on app.\*" behavior:** `metadataBase` was the apex domain `https://humansignalindex.org`. Canonical/OG URLs resolved there, and if the apex redirects to `app.*`, shared/canonical links would land on the app. **Fix:** `metadataBase` now points to `https://www.humansignalindex.org`; all canonical + OG URLs resolve on the marketing origin.
- **Deployment recommendation:** set `NEXT_PUBLIC_APP_URL=https://app.humansignalindex.org`, serve marketing from `https://www.humansignalindex.org`, and redirect the apex to `www` (not `app`).

## 6. Footer audit findings (M)

- **Our Mission** now points to `/mission` (was `/about`).
- **Methodology was duplicated** (it appeared in both the About and Trust columns). The Trust-column duplicate was replaced with **Accessibility** (`/accessibility`); Methodology remains once, in the About column.
- Added **About HSI** (`/about`) to the About column so About and Mission are both reachable.
- All footer links resolve to existing routes; active footer link is highlighted.

## 7. SEO audit findings (N)

- `metadataBase` standardized to the `www` marketing origin; root gained Open Graph + Twitter card defaults.
- Per-page `metadata` with `description` + relative `alternates.canonical` added/normalized for: About, Mission, Signal Library, Research Reports, Education Hub (+ `[slug]` via `generateMetadata`), Transparency, Ethics, Contact, Accessibility, Submit a Signal, Public Reports, and all four security/disclosure pages.
- Titles use the existing `%s · Human Signal Index` template.

## 8. Verification table

| Check | Result |
| --- | --- |
| Typecheck (`apps/web`) | ✅ clean (exit 0) |
| Tests (full suite) | ✅ (see run; public-site changes are content/UI, no test regressions) |
| Build (`next build`) | ✅ (new routes registered) |
| Route audit | ✅ `/mission`, `/accessibility`, `/education-hub/[slug]` build |
| Accessibility audit | ✅ keyboard-reachable controls, focus ring, ARIA labels, reduced-motion + contrast modes, no third-party overlay |
| Metadata audit | ✅ canonical + description on all listed pages; `www` metadataBase + OG |

## 9. Notes / remaining

- Em dashes were removed from user-facing prose across the listed pages and the home/methodology/trust pages. A few remain in code comments and in offline-only "demo content" banners (not core copy).
- The Contact and Confidential-report forms keep their existing behavior; this phase changed copy and clarity only.
- Education Hub guide bodies are intentionally structural placeholders ("in preparation"), not fabricated articles.
- Pre-existing repo-wide `next lint` breakage (ESLint 9 vs Next 14.2.5) is unrelated; typecheck + tests + build are the gates.
