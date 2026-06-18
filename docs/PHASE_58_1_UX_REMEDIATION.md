# Phase 58.1 — UX Remediation & Navigation Cleanup

Implements the four High UX findings (H1–H4) plus the duplicate-label cleanup (M1)
from `docs/PHASE_58_UX_AND_WORKFLOW_VALIDATION.md`. Focused remediation only — no new
features, no schema/RBAC/auth/workflow changes.

## Files changed

| File | Change | Fix |
|---|---|---|
| `packages/ui/src/navigation.tsx` | Wired 6 surfaces into the sidebar; repointed 2 mismatched labels; disambiguated Forecasts→"Forecast Lab"; added `Eye` icon import | 1, 2, 5 |
| `packages/ui/src/nav-roles.ts` | NAV_VISIBILITY + ALL_NAV_HREFS entries for the wired routes (visibility = route gate) | 1 |
| `packages/ui/tests/nav-roles.test.ts` | +1 test proving nav visibility matches route gates for the wired surfaces | 1 |
| `apps/web/components/home/MissionControlPreview.tsx` | Replaced the "live" indicator with an "Illustrative preview" badge | 3 |
| `apps/web/app/(marketing)/page.tsx` | Added a caption clarifying the preview is example layout, not live | 3 |
| `apps/web/components/navigation/ReadOnlyNotice.tsx` | **New** — read-only guidance banner (presentational; no actions/gate bypass) | 4 |
| `apps/web/app/dashboard/{my-work,collaboration,release-candidate}/page.tsx` | Added the guidance notice explaining what's possible + where to act + role notes | 4 |

---

## FIX 1 + 2 + 5 — Navigation: before / after

| Sidebar label | Before → | After → | Note |
|---|---|---|---|
| Source Registry | `/dashboard/sources` | **`/dashboard/source-registry`** | now the Phase 46 console |
| Manage Sources | *(absent)* | **`/dashboard/sources`** | legacy CRUD kept, renamed |
| Watchlists | *(absent in sidebar)* | **`/dashboard/watchlists`** (Operations) | Phase 51 |
| Forecasting | *(absent in sidebar)* | **`/dashboard/forecasting`** (Forecasting) | Phase 52 |
| Forecast Lab | "Forecasts" → `/dashboard/forecasts` | **"Forecast Lab"** → `/dashboard/forecasts` | disambiguated from "Forecasting" |
| Collaboration | *(absent in sidebar)* | **`/dashboard/collaboration`** (Human Operations) | Phase 53 |
| Release Candidate | *(absent in sidebar)* | **`/dashboard/release-candidate`** (Launch & Beta) | Phase 55 |
| Beta Operations | `/dashboard/admin/tester-ops` | **`/dashboard/beta-operations`** (Admin) | now the Phase 50 console |
| Tester Ops | *(absent)* | **`/dashboard/admin/tester-ops`** (Admin) | legacy admin page kept |

All six previously-orphaned surfaces are now reachable from the sidebar; the two
mismatched labels point at their real consoles; legacy pages remain reachable under
clearer names. Every sidebar label now matches its destination.

### Route visibility matrix (after)

| Route | Admin | Curator | Reviewer | Researcher | Contributor/Viewer | Gate |
|---|:---:|:---:|:---:|:---:|:---:|---|
| `/dashboard/source-registry` | ✓ | ✓ | ✓ | ✗ | ✗ | PROTECTED_ROUTES reviewer + NAV reviewer |
| `/dashboard/watchlists` | ✓ | ✓ | ✓ | ✓ | ✗ | researcher (56.1) |
| `/dashboard/forecasting` | ✓ | ✓ | ✓ | ✓ | ✗ | researcher (56.1) |
| `/dashboard/collaboration` | ✓ | ✓ | ✓ | ✓ | ✗ | page `canResearch` + NAV researcher |
| `/dashboard/release-candidate` | ✓ | ✓ | ✓ | ✓ | ✗ | page `canResearch` + NAV researcher |
| `/dashboard/beta-operations` | ✓ | ✗ | ✗ | ✗ | ✗ | page `isAdmin` + NAV admin |
| `/dashboard/my-work` | ✓ | ✓ | ✓ | ✓ | ✗ | researcher (existing) |

**Consistency guarantee:** NAV_VISIBILITY for each wired route equals its route gate,
so **no item appears to a user who cannot access it**. A new test
(`packages/ui/tests/nav-roles.test.ts`) asserts this (e.g. source-registry hidden
from researcher, beta-operations admin-only, the researcher surfaces hidden from
viewer). The existing invariant test (every NAV_VISIBILITY key ∈ ALL_NAV_HREFS, no
dupes) still passes after adding the four new menu hrefs.

---

## FIX 3 — Homepage demo card

The homepage "Mission Control" preview previously showed a fabricated chart with a
pulsing **"live"** indicator. Now:
- the indicator is an explicit **"Illustrative preview"** badge (no pulse), and
- the section adds a caption: *"An example of the analyst command center layout. Live
  platform figures appear in the metrics and signal feed above; this panel is an
  illustrative preview."*

No fabricated numbers are presented as live; the genuinely-live homepage sections
(metric strip, signal feed, globe — Phase 43) are unchanged. Visual quality preserved.

---

## FIX 4 — Researcher guidance

A new presentational `ReadOnlyNotice` banner was added to the three read-only
researcher surfaces. It explains, per page: what you can do here, why the surface is
read-only, where to submit / review / publish, and which actions need
reviewer/curator/admin roles. **It adds no write actions and bypasses no gate.**

- **/dashboard/my-work** — "read-only workspace… submit via Submit a Signal; reviewers
  act in the Review Queue; drafting/publishing needs curator." (action: Submit a Signal)
- **/dashboard/collaboration** — "coordination view, not chat, no assignment… investigate
  in My Work; act in Review Queue; publish via Publishing (curator)." (action: My Work)
- **/dashboard/release-candidate** — "read-only launch readiness… actions live in Mission
  Control / Review Queue / Publishing; some figures admin-only." (action: Mission Control)

---

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json` — **clean (exit 0)**.
- `tsx --test` (chunked) — **2670 / 2670 pass, 0 fail** (+1 new nav-visibility test).
- `next build` (apps/web, clean `.next`) — **exit 0, "Compiled successfully"**.

Caught + fixed mid-run: a duplicate `NAV_VISIBILITY` key (`/dashboard/my-work`
already existed at Phase 24) — removed the redundant addition; suite green.

(The repo has no `pnpm typecheck`/`pnpm test` scripts; canonical commands above.)

---

## Result

All four Phase 58 High findings resolved + the duplicate-label cleanup:
- ✅ Orphaned surfaces are in the sidebar (H1)
- ✅ Mismatched labels repointed to real consoles (H2)
- ✅ No fabricated homepage numbers presented as live (H3)
- ✅ Researchers see what to do next + role requirements (H4)
- ✅ Duplicate/confusing labels disambiguated (Forecasting vs Forecast Lab; Source
  Registry vs Manage Sources; Beta Operations vs Tester Ops) (M1)
- ✅ Nav visibility == route access for every wired surface (test-enforced)

### Verdict: **READY FOR PHASE 59 LAUNCH READINESS REVIEW**
