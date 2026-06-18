# Phase 58 — UX & Research Workflow Validation

**Type:** audit + validation. No features built, no schema/RBAC/workflow changes.
Findings are evidence-based (file:line), with risk tempered against intent (the
Phase 43–55 intelligence surfaces are *by design* read-only view layers; the write
workflows live in the pre-existing pages).

---

## Executive summary

HSI is **comprehensible and the reviewer workflow is complete**, but it has real
**discoverability gaps** introduced by the Phase 46–55 build-out: several new
surfaces aren't in the sidebar, two sidebar labels point at different pages than the
dedicated consoles, and the public homepage still renders one fabricated "preview"
chart. Empty-state coverage is strong; the public marketing site explains the
platform well.

**Verdict: MONITOR** — **READY for a guided / cohort beta** (onboarded testers, known
URLs). Before **broad self-serve onboarding**, fix the four High items (orphaned
navigation, label mismatches, homepage demo data, researcher action affordance).

| Persona | End-to-end usable today? |
|---|---|
| **Reviewer** | ✅ Yes — queue → evidence verdicts (approve/reject/needs-more) → publication approve/publish all wired |
| **Admin** | ✅ Mostly — all consoles exist & are useful; some (beta-operations, release-candidate) only reachable by URL |
| **Researcher** | 🟡 Partial — signal submission works; the read-only workspace offers no in-UI path to *act on* a case, and drafting is curator-gated without explanation |

---

## 1. Researcher audit — Signal → Investigation → My Work → Collaboration → Publication

| Step | Surface | State | Finding |
|---|---|---|---|
| Signal intake | `/submit-a-signal` (public form) | ✅ Functional | `submitPublicSignalAction` writes `signal_submissions`; any signed-in user. |
| Signal intake (dash) | `/dashboard/signal-intake` | Read-only | Metrics + triage queue; "Run triage" intentionally disabled (worker-driven). A researcher expecting to submit here finds no form, no pointer to `/submit-a-signal` → **Medium** discoverability. |
| Investigation / My Work | `/dashboard/my-work` (Phase 48) | Read-only | InvestigationQueue + CaseDrawer **display** cases (ownership shown at pool level by design) but expose **no "claim/assign/advance" affordance** and no link to where action happens → **High** affordance gap. |
| Collaboration | `/dashboard/collaboration` (Phase 53) | Read-only (by design) | Coordination visibility, explicitly "not chat / no assignment". Correct, but combined with the above leaves the researcher with visibility and no agency. |
| Publication | `/dashboard/publishing/new` | Role-gated | Draft creation works but `createPublicationAction` requires curator+ (entitlement + RBAC). Researchers can view the queue but **can't draft**, with no in-UI explanation of the role requirement → **High** (expectation gap). |

**Net:** the *capabilities* exist (submit signal; reviewers/curators run the
publish pipeline), but the **researcher's in-UI path from "see a case" to "do
something" is not signposted** — the workspace is a viewer, and drafting is gated.
This is partly intentional (read-only intelligence layers) and partly a genuine
affordance/onboarding gap.

## 2. Reviewer audit — Review Queue → Evidence → Approve/Reject → Publication

**Functional end-to-end (6 of 7 steps).**

- `/dashboard/review` — real queue via `listReviewQueueAction` (evidence reviews,
  research reviews, publication queue, escalations), filterable. ✅
- `/dashboard/review/evidence` — `EvidenceReviewControls` with four wired verdicts
  (Approve / Reject / Needs Review / Needs More) → `reviewEvidenceAction`; reviewer/
  curator/admin gated. ✅
- `/dashboard/publishing` — `reviewPublicationAction` (approve/reject + reason) and
  `PublishControl` (→ PUBLISHED) for curators; transitions logged + reversible. ✅
- **Gap (Medium):** evidence review is evidence-centric — a reviewer sees source +
  support/contradiction counts but **not the originating signal / research-run
  context or prior decisions** on one screen.

## 3. Admin audit — Mission Control · Source Registry · Beta Operations · Release Candidate · Trust Center

All consoles exist and are genuinely useful (live, server-rendered, role-gated).
Operational visibility is strong. **Discoverability is the issue:**

- `/dashboard` (Mission Control) — in sidebar ✅.
- `/dashboard/source-registry` (Phase 46 console) — **orphaned**; sidebar "Source
  Registry" points to `/dashboard/sources` (the Phase 9 CRUD page) instead.
- `/dashboard/beta-operations` (Phase 50) — **orphaned**; sidebar "Beta Operations"
  (Admin) points to `/dashboard/admin/tester-ops` — a *different* page.
- `/dashboard/release-candidate` (Phase 55 capstone) — **orphaned**; no sidebar
  entry, no cross-link. An admin can't find the "are we ready to launch?" screen.
- `/dashboard/trust` + public `/trust` — discoverable ✅.

## 4. Navigation findings

Sidebar = 15 groups / ~94 items (well-organized). Issues:

- **H1 — Orphaned new surfaces** (reachable by direct URL only; gated by middleware
  per Phase 56.1, so *secure*, just *undiscoverable*): `/dashboard/forecasting`,
  `/dashboard/collaboration`, `/dashboard/release-candidate`,
  `/dashboard/beta-operations`, `/dashboard/source-registry`, `/dashboard/watchlists`.
  (`/dashboard/my-work` and `/dashboard/contributors` ARE in the sidebar.)
- **H2 — Label↔destination mismatch:** sidebar "Source Registry" → `/dashboard/sources`
  (line 330) and admin "Beta Operations" → `/dashboard/admin/tester-ops` (line 484);
  the dedicated Phase 46/50 consoles live at different paths → a tester clicking the
  label lands on a *different* page than the feature.
- **M1 — Duplicate/overlapping labels:** Forecasts (Phase 21) vs Forecasting (52);
  Alerts (workflow) vs Watchlists (51); Operations vs Operations Center; Sources vs
  Source Registry. A tester can't tell which to use.
- **M2 — No global breadcrumbs.** TopNav shows title/subtitle only; lateral nav comes
  from section sub-navs (IntelNav, OperationsNav, CollectiveNav, ForecastingNav, …)
  and a few inline back-links (e.g. `/intelligence/[slug]` "All intelligence"). Deep
  detail pages can feel like dead-ends.

## 5. Empty-state findings — strong

A reusable `EmptyState` + consistent inline messages give **good coverage** across
the new surfaces:

- ✅ "No public signals published yet." (signal library / homepage feed)
- ✅ "Not enough data yet." (forecasting trends, trust scorecard nulls — Phase 56.1)
- ✅ "No early-warning indicators are firing." / "All clear." (forecasting, alerts,
  collaboration escalations)
- ✅ "No forecast history yet.", "No corrections — clean record.", per-queue empties
  in publishing, contributors, consensus, compliance.

Gaps:
- **M3 — Zero-data dashboards lack framing.** `/dashboard`, `/dashboard/beta-operations`,
  etc. render all-zero metric grids on a fresh platform with no "this is normal / get
  started" context; `ExecutiveSummary` shows ambiguous "—".
- **L3 —** the explorer header reads "Live signal records" at zero-data (mildly
  ambiguous vs. an explicit "none yet").

## 6. Workflow findings (efficiency)

- **Reviewer: efficient.** Evidence verdict in ~2 clicks from the queue; publication
  approve→publish is 2 actions. Main friction = missing upstream context (one extra
  navigation to reconstruct the case).
- **Researcher: blocked-by-design at the act step.** Signal→publication is not
  self-completable by a researcher in-UI (claim affordance absent; draft curator-
  gated). For beta this is acceptable *if* testers are told the model; otherwise it
  reads as a dead-end.
- **Admin: efficient detection** once the consoles are found — Mission Control +
  Release Candidate + Beta Operations answer "what's happening / are we ready" at a
  glance. The blocker is *finding* them (H1).

## 7. Beta-tester simulation (no docs)

| Question | Answer | Evidence |
|---|---|---|
| What does HSI do? | ✅ Clear | Homepage hero + About + Methodology (5-step pipeline) |
| How is trust established? | ✅ Clear | Trust Center copy + About governance section |
| How do investigations flow? | 🟡 Partial | Methodology explains it; the in-app flow must be inferred (no flow diagram / signposting) |
| What should I do next? | ✗ Weak | `/dashboard` has only `RoleTaskCards` (async) — no global "start here"; all-zero metrics with no CTA |

Public marketing→app handoff is **excellent** (home/about/methodology/mission). The
weak point is **inside** the dashboard for a first-run user.

## 8. Homepage credibility

- **H3 — Fabricated "Mission Control" preview on the public homepage.**
  `app/(marketing)/page.tsx:54` `MISSION` is a hardcoded demo (sin-based heatmap +
  fixed series) rendered at `:212`. The rest of the homepage is live (Phase 43), so
  this one demo card is inconsistent and could mislead a fresh-platform visitor into
  thinking there's activity. (Flagged as an "illustrative preview" back in Phase 43 —
  worth resolving before broad public beta.)

---

## UX risk matrix

| Severity | Finding |
|---|---|
| **Critical** | — none (no launch-blocking defect; reviewer flow works, comprehension is good, surfaces are secure) |
| **High** | H1 orphaned Phase 46/50/51/52/53/55 surfaces (undiscoverable in sidebar) · H2 sidebar label↔destination mismatches (Source Registry, Beta Operations) · H3 fabricated homepage preview chart · H4 researcher has no in-UI affordance/signpost to act on a case (claim/draft) |
| **Medium** | M1 duplicate/overlapping labels · M2 no global breadcrumbs · M3 zero-data dashboards lack "fresh/get-started" framing + ambiguous "—" · M4 reviewer lacks upstream signal/run context · M5 thin dashboard first-run guidance |
| **Low** | L1 onboarding page is optional (no first-run redirect) · L2 signal-intake read-only may confuse (by design) · L3 "Live signal records" label at zero-data |

---

## Recommendations (audit only — not implemented)

1. **Wire the orphaned surfaces into the sidebar** (H1) — add forecasting,
   collaboration, release-candidate, source-registry, watchlists, and (admin)
   beta-operations to the relevant nav groups; or intentionally hide and document.
2. **Resolve label mismatches** (H2) — point "Source Registry"/"Beta Operations" at
   the dedicated consoles, or rename to distinguish from `/sources` & `/admin/tester-ops`.
3. **Replace the homepage demo preview** (H3) — feed it the live bundle, or clearly
   badge it "illustrative", to match the no-fabricated-data ethos.
4. **Add a researcher action path** (H4) — a "claim / open in workflow" link from the
   CaseDrawer to the real workflow surface, and an in-UI note that drafting requires
   curator (or a "request publication" path).
5. **Disambiguate labels** (M1) — e.g. "Forecast workflows" vs "Forecasting (intel)";
   "Alert workflows" vs "Watchlists".
6. **Add a dashboard first-run welcome / quick-start** (M3/M5) and a flag-based
   first-time redirect to `/dashboard/tester-onboarding` (L1).
7. **Add breadcrumbs / back-links** on detail pages (M2).

Items 1–3 are small and low-risk; happy to implement them as a focused "Phase 58.1"
on request.

---

## Beta readiness verdict: **MONITOR**

- **READY** for a **guided / cohort** beta (testers onboarded, given URLs, told the
  role model). Core flows work, surfaces are secure, comprehension material is strong.
- Fix **H1–H4** before **broad self-serve** onboarding to avoid discoverability and
  credibility confusion.

---

## Verification

- `tsc --noEmit -p apps/web/tsconfig.json` — **clean (exit 0)**.
- `tsx --test` (chunked) — **2669 / 2669 pass, 0 fail**.
- `next build` (apps/web) — **exit 0, "Compiled successfully"**.

No application code changed this phase; platform remains green, no regressions.
(The repo has no `pnpm typecheck`/`pnpm test` scripts; canonical commands above.)
