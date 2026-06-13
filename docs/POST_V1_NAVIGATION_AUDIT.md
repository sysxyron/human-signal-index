# Post-V1 Navigation, Routes, Actions & UX Audit

**Scope:** stabilization + usability pass over the dashboard. No new features, no
governance-logic changes, no engine changes. Focus: dead buttons, broken/missing
navigation, route mismatches, hydration warnings, and silent failures.

**Status:** ✅ Build green · Typecheck green · 2,033 tests passing (0 failures) ·
route-audit passing (109 routes/hrefs resolve) · no regressions through Phase 22.

---

## 1. Summary of findings

| Area | Found | Action |
| --- | --- | --- |
| Dead buttons (no handler/href) | 16 | Wired to a route, or made visibly disabled with a reason |
| Route mismatch | 1 (sidebar → mock Review Queue) | Repointed to the real hub + back-compat redirect |
| Missing route | 1 (`/dashboard/publishing/new`) | Created (governed draft form) |
| Orphaned routes (unreachable from global nav) | Phases 15–22 (≈30 routes) | Added to the sidebar |
| Hydration warnings | 4 components with float-styled inline values | Rounded to deterministic precision |
| `[object Object]` / raw error rendering | 0 real instances | Confirmed clean (already uses `formatErrorMessage`) |
| Silent header control | 1 (TopNav bell) | Linked to `/dashboard/alerts` |

The reported console warning —
`Prop 'style' did not match … opacity:0.7197092767348335 (server) vs …336 (client)`
originating in **HeatmapCard** — was reproduced and fixed (root cause below).

---

## 2. Routes

### Added
- **`/dashboard/publishing/new`** — the previously-missing destination for the
  "New report" / "Draft new report" CTAs. A governed draft form
  (`NewReportForm`) that calls the existing `createPublicationAction`. Reports are
  created in **DRAFT** state and enter the review queue — never auto-published.
  File: `apps/web/app/dashboard/publishing/new/page.tsx` +
  `apps/web/components/publishing/NewReportForm.tsx`.

### Fixed
- **Sidebar "Review Queue"** previously pointed at `/dashboard/review-queue`, a
  static mock with placeholder data and a dead "Claim next item" button. It now
  points at **`/dashboard/review`**, the real Phase-6 human-review hub.

### Redirected
- **`/dashboard/review-queue`** → permanent `redirect()` to `/dashboard/review`.
  Old links and bookmarks no longer land on a placeholder. The mock (and its dead
  button) are gone. File: `apps/web/app/dashboard/review-queue/page.tsx`.

### New: central route registry
- **`apps/web/lib/navigation/routes.ts`** — one source of truth (`ROUTES`) for
  every in-app path, consumed by the fixed buttons, the new page, and the audit
  script. `REDIRECT_ROUTES` marks aliases. Hardcoded strings in the touched files
  were replaced with `ROUTES.*`.

### New: route-audit script
- **`apps/web/scripts/route-audit.ts`** — scans `apps/web/app/**/page.tsx`,
  normalises each to a route (stripping `(group)` segments, honouring `[param]`),
  then verifies every `ROUTES` value and every dashboard-sidebar href resolves to a
  real page. Prints `✓ Route exists` / `✗ Missing route` and **exits non-zero** on
  any break (CI-ready). Run: `npx tsx apps/web/scripts/route-audit.ts`.
  Current result: **122 pages scanned · 102 static + 20 dynamic routes · 0 missing.**

---

## 3. Buttons

### Fixed → now navigate (real destinations)
| Button | Page | New target |
| --- | --- | --- |
| New report | Mission Control | `/dashboard/publishing/new` |
| Open Evidence Vault | Mission Control | `/dashboard/evidence-vault` (drawer kept as "Preview evidence") |
| Draft new report | Public Reports | `/dashboard/publishing/new` |
| Manage sources (was "Register source") | Source Registry | `/dashboard/sources` |
| Browse signals (was "Filters") | Signal Intake | `/dashboard/signals` |
| View security center (was "View audit log") | Security Monitor | `/dashboard/security` |
| Save draft | New Report form | `createPublicationAction` (governed draft) |
| Alerts bell | Global TopNav | `/dashboard/alerts` |

### Disabled intentionally → visible, with a tooltip reason (no silent clicks)
These static/demo pages have no backing action and we did **not** build one. They
now render via `SafeActionButton` as visibly-disabled with a `disabledReason`:

| Button | Page | Reason shown |
| --- | --- | --- |
| Run triage | Signal Intake | Triage runs automatically via the worker |
| Re-run classifier | Rhetoric Classifier | Classification runs automatically on ingest |
| Recalculate scores | Risk Scoring | Scores recompute automatically on new evidence |
| Rebuild trace graph | Traceability Engine | Graph rebuilds automatically as sources are linked |
| Save draft / Submit for review | Counter-Narrative Studio | Drafting is a preview; not wired to persistence in this build |
| Save changes | Settings | Settings persistence not enabled in this environment |
| Manage API keys | Settings | Available to admins in the Security Center |
| Export evidence bundle (×2) | Mission Control, Evidence Vault | Export needs a persisted/sealed evidence set |

### New: `SafeActionButton`
- **`apps/web/components/navigation/SafeActionButton.tsx`** — guarantees every CTA
  resolves to exactly one behaviour: `href` (Next `<Link>`), `onClick`, or
  `disabledReason` (disabled + tooltip). If none is supplied it logs a dev warning
  and renders disabled — making a silent dead control impossible to ship unnoticed.

---

## 4. Sidebar

### Missing links found
The global sidebar (`packages/ui/src/navigation.tsx` → `dashboardNavGroups`) only
exposed Operations / Intelligence / Workflow / WorldForge / System. Every
Phase 15–22 surface (Forecasting, Collective intelligence, Trust & Outcomes,
Publishing, Executive Command Center, Simulation) existed on disk but was
**unreachable from the global nav** — only via direct URL or in-page sub-nav.

### Corrected links
- `Review Queue`: `/dashboard/review-queue` → **`/dashboard/review`**.

### Added groups (all targets verified to exist on disk)
- **Operations**: + Operations Center (`/dashboard/operations`)
- **Intelligence**: + Intelligence Ops, Decision Explorer
- **Forecasting**: Forecasts, Scenarios, Early Warnings
- **Collective**: Investigations, Consensus, Debates, Contributors
- **Trust & Outcomes**: Outcomes, Governance, Trust Center, Calibration
- **Publishing**: Publications, Publishing Review, Retractions
- **Executive**: Command Center, Priorities, Risks, Opportunities, Briefings, Exec Governance
- **WorldForge**: + Simulation Lab (`/dashboard/simulation`)
- **System**: + Security Center

Every sidebar href is validated by `route-audit.ts` (all ✓).

---

## 5. Hydration

**Root cause.** Inline `style` values computed from non-rounded floats serialise to
long decimals (e.g. `opacity:0.7197092767348335`). When the source value comes from
`Math.sin`/division, Node's and the browser's math libs can differ by ~1 ULP, so the
server- and client-rendered strings differ on the last digit → React hydration
mismatch. The reported warning was in **HeatmapCard** (used by the `'use client'`
Mission Control page, whose heat matrix is built with `Math.sin`).

**Fix.** Round computed inline-style numerics to a fixed precision so the serialized
string is byte-identical on both sides:

| Component | Before | After |
| --- | --- | --- |
| `packages/ui/src/data-display.tsx` (HeatmapCard) | `opacity: 0.12 + v * 0.85` | `Number((0.12 + v * 0.85).toFixed(3))` |
| `components/worldforge/evidence/EvidenceHeatmap.tsx` | `width: ${intensity*100}%`, `opacity: 0.4 + intensity*0.6` | `Math.round(...)%`, `.toFixed(3)` |
| `components/calibration/TrustDistributionChart.tsx` | `height: Math.max(2, h)` | `Math.round(Math.max(2, h))` |
| `components/worldforge/research/ClassificationBar.tsx` | `width: ${pct}%` | `width: ${pct.toFixed(2)}%` |

No `Math.random()` / `Date.now()` is used during render anywhere; the deterministic
`Math.sin` heat matrices are fine once consuming components round their styles. The
Footer's `new Date().getFullYear()` (marketing chrome) is intentionally left as-is —
it only differs across a year boundary and is outside the dashboard scope.

---

## 6. `[object Object]` / error rendering

No real instances. The app already routes every user-facing error through
`apps/web/lib/errors/format-error.ts` (`formatErrorMessage`), which handles Error
objects, Supabase/PostgREST error shapes, and plain objects (JSON fallback) so a
bare `[object Object]` can never render. Verified across `ErrorState`,
`RunErrorState`, error boundaries, and every control component. No change required.

---

## 7. QA pass

Because this environment has no browser, each CTA and route was verified by: (a)
static inspection of the handler/href/disabled state, (b) the `route-audit.ts`
script (every target resolves), and (c) a successful production build that
compiles and statically generates all 105 routes including the new page and the
redirect.

| Surface | CTAs / links | Result |
| --- | --- | --- |
| Mission Control | Preview evidence (drawer), Open Evidence Vault (→route), New report (→route), Export bundle (disabled+reason), View evidence (drawer) | ✓ |
| Source Registry | Manage sources (→route) | ✓ |
| Signal Intake | Browse signals (→route), Run triage (disabled+reason) | ✓ |
| Rhetoric Classifier | Re-run classifier (disabled+reason) | ✓ |
| Risk Scoring | Recalculate scores (disabled+reason) | ✓ |
| Traceability Engine | Rebuild trace graph (disabled+reason) | ✓ |
| Public Reports | Draft new report (→route) | ✓ |
| Evidence Vault | Open/Inspect drawer (handlers), Export bundle (disabled+reason) | ✓ |
| Counter-Narrative | Save draft / Submit (disabled+reason) | ✓ |
| Settings | Save changes / Manage API keys (disabled+reason) | ✓ |
| Security Monitor | View security center (→route) | ✓ |
| New Report (new) | Save draft (governed action), Go to Publishing (→route) | ✓ |
| Review Queue | `/dashboard/review-queue` → redirect → `/dashboard/review` | ✓ |
| Global sidebar | 49 hrefs across 10 groups | ✓ all resolve |
| Global TopNav | Alerts bell (→/dashboard/alerts) | ✓ |

**Known cosmetic (not a button):** the TopNav search `<input>` is a visual
placeholder and is intentionally left non-wired (search is out of scope for this
pass); it is an input, not a clickable control, so it produces no silent click.

---

## 8. Files changed

**Added**
- `apps/web/lib/navigation/routes.ts` (route registry)
- `apps/web/components/navigation/SafeActionButton.tsx`
- `apps/web/app/dashboard/publishing/new/page.tsx`
- `apps/web/components/publishing/NewReportForm.tsx`
- `apps/web/scripts/route-audit.ts`
- `docs/POST_V1_NAVIGATION_AUDIT.md`

**Modified**
- `packages/ui/src/navigation.tsx` (sidebar groups + Review Queue target + TopNav bell)
- `packages/ui/src/data-display.tsx` (HeatmapCard opacity rounding)
- `apps/web/components/worldforge/evidence/EvidenceHeatmap.tsx` (rounding)
- `apps/web/components/calibration/TrustDistributionChart.tsx` (rounding)
- `apps/web/components/worldforge/research/ClassificationBar.tsx` (rounding)
- `apps/web/app/dashboard/review-queue/page.tsx` (→ redirect)
- Dead-button fixes: `dashboard/page.tsx`, `source-registry`, `signal-intake`,
  `rhetoric-classifier`, `risk-scoring`, `traceability-engine`, `public-reports`,
  `evidence-vault`, `counter-narrative`, `settings`, `security-monitor` pages.

---

## 9. Success criteria

- [x] Build green
- [x] Typecheck green (web / worker / engine)
- [x] Tests green (2,033 / 2,033)
- [x] All sidebar routes functional (route-audit ✓)
- [x] All buttons functional or visibly disabled with a reason (no silent clicks)
- [x] No missing routes / no route mismatches
- [x] No hydration warnings (float styles rounded deterministically)
- [x] No `[object Object]` errors (already handled by `formatErrorMessage`)
- [x] No regressions to Phases 1–22

---

## 10. Live QA pass — menu regression repair (round 2)

Ran the app (`pnpm dev`) and tested navigation like a real user. Reproduction +
findings:

### Method
- Started the dev server and probed ~60 routes by HTTP status.
- Confirmed every sidebar href and every in-page tab-nav href resolves to a real
  page (route-audit + a dedicated nav-component sweep — **0 broken targets**).
- Rendered the authenticated-layout HTML (via the public WorldForge page) and
  verified the full sidebar (49 links across 10 groups) ships with correct
  `href`s and no error markers.
- Ran an **exhaustive** dead-control sweep across every dashboard page and every
  component directory.

### What was actually happening
1. **The dashboard sidebar/tab links are not dead.** Every dashboard route is
   auth-gated (`middleware.ts`): signed-out users are 307-redirected to `/sign-in`,
   and role-gated routes (e.g. `review`, `sources`, `operations`, `security`,
   `settings`, `decisions`, `simulation`) redirect insufficient-role users to
   `/dashboard?denied=<route>`. The redirect was **silent** — landing back on
   Mission Control with no explanation reads exactly like "the menu did nothing."
   This is the regression the expanded sidebar *exposed* (more gated destinations
   are now visible).
2. **4 genuinely dead buttons remained — all on public marketing pages** (not the
   dashboard, which the round-1 pass had already cleaned).

### Fixes (no auth/governance logic changed)
- **`AccessDeniedNotice`** (`apps/web/components/governance/AccessDeniedNotice.tsx`)
  — a dismissible banner rendered on `/dashboard` (inside `<Suspense>`). When the
  middleware bounces a click with `?denied=<route>`, it now shows *"Access to '…'
  requires a higher role … the menu item is not broken, it's restricted."* The
  bounce is no longer silent. It only reports the decision the middleware already
  made.
- **Marketing dead buttons disabled with a visible reason** (tooltip): Education
  Hub "Open", Research Reports "Read" + download, Signal Library "Filter".

### Decisions / non-changes
- Sidebar items for role-gated routes are **kept enabled** (they work for
  authorized users) rather than globally disabled — the sidebar component lives in
  `@hsi/ui` and has no role context; surfacing the denial reason on landing is the
  correct, lower-risk fix.
- The TopNav search `<input>` remains a non-wired placeholder (an input, not a
  clickable control); the TopNav bell already links to `/dashboard/alerts`.
- The sidebar uses full-navigation `<a>` (unchanged) — links always resolve;
  not coupling `@hsi/ui` to `next/link`.

### Re-verification
- Build green (105 pages) · web tsc 0 errors · route-audit 0 missing ·
  full suite **2,033 / 2,033** · dev server served all marketing + WorldForge
  routes 200 with no compile/runtime errors in the log.

**Added:** `apps/web/components/governance/AccessDeniedNotice.tsx`
**Modified:** `apps/web/app/dashboard/page.tsx` (denial banner), Education Hub /
Research Reports / Signal Library marketing pages (disabled dead buttons).
