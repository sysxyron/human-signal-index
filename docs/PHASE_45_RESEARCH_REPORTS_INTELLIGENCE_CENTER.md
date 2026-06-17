# Phase 45 — Research Reports Intelligence Center

Research Reports is now the primary finished-intelligence destination of Human
Signal Index. The public journey is **Homepage → Signal Library → Research
Reports**, and the reports surface reads like a professional intelligence product
(briefing cards, executive summaries, traceability center, intelligence timeline,
narrative map) rather than a blog or CMS article.

**Untouched:** RBAC, IAM, auth, middleware, billing, Stripe, compliance, role
approval, **and the CMS publishing workflow** (the page keeps its CMS-first guard
— if an editor has published a CMS page for `/research-reports`, it renders
unchanged). Read-only public experience. No schema/RLS changes. The existing deep
report page at `/intelligence/[slug]` (Phase 19 publishing portal) is left intact;
each briefing links out to it as the "full report".

---

## Architecture & data flow

```
hsin_publications (PUBLISHED / ARCHIVED / RETRACTED, RLS-safe)
        ▼
lib/public-intelligence.ts                                  [cached, server-only]
   • getSignalLibraryData()  → reports + facets + categoryActivity + trends
   • getPublicActivityFeed() → shared homepage activity bundle (reused)
        ▼
app/(marketing)/research-reports/page.tsx  (server)
   • CMS-first guard preserved (renders CmsBlocks if a CMS page exists)
   • <TrustStrip/>                          Part 9 — trust & governance signal
   • <NarrativeMap activity=…/>             Part 7 — relationship graph + live counts
   • <ReportActivityFeed items=…/>          Part 8 — real recent activity, empty-safe
   • <ReportsExplorer data=…/>              Parts 1–2 — search / facets / sort / cards
        └─ <ReportDetailDrawer/> (on demand) Parts 3–6,10
              Trust strip · Executive summary (+ key findings + assessment)
              Intelligence timeline · Traceability center · Related intelligence
              reading-progress bar · sticky metadata · anchor nav
              → "Open full report" → /intelligence/[slug]
```

- **Part 11 (performance / reuse):** everything is built on the **same**
  `lib/public-intelligence.ts` + `public-intelligence-mapping.ts` + `unstable_cache`
  tag (`public-intelligence`) as Phase 43/44. `getSignalLibraryData()` and the
  homepage activity bundle are both already cached — this page adds **no new query
  infrastructure** and no duplicate reads (the two cached reads run via
  `Promise.all`). The drawer is the only "detail" surface and mounts **on demand**.

### Parts delivered
1. **Reports explorer** — debounced search; category/risk/status facets with
   counts; **sort by newest / highest traceability / highest risk**.
2. **Intelligence report cards** — category, risk, human-reviewed badge, title,
   executive-summary preview (3-line clamp), evidence count, traceability badge.
3. **Executive summary panel** (drawer) — summary, key findings (derived from the
   real summary), risk assessment, confidence, traceability, human-review status.
4. **Intelligence timeline** (drawer) — Signal Detected → Evidence Collected →
   Analysis Completed → Human Review → Report Published, with the report's real
   values and publication date.
5. **Traceability center** (drawer) — evidence count, sources referenced, review
   status, publication history, corrections, version, traceability score.
6. **Related intelligence** (drawer) — related reports (same category, real),
   related narrative types (taxonomy), related categories, and a link into the
   Signal Library for that category. No fabricated recommendations.
7. **Narrative relationship map** — public-safe intelligence graph (Influence →
   Recruitment/Propaganda/Misinformation, Misinformation → Health/Civic/Extremism,
   …) with live bucket counts.
8. **Report activity feed** — real public-safe events (Report Published, Evidence
   Linked, Review Completed, …); graceful "No recent activity yet." empty state.
9. **Trust & governance strip** — ✓ Human Reviewed · ✓ Evidence Linked · ✓
   Traceable · ✓ Version Controlled · ✓ Public Interest Research (page + drawer).
10. **Reading experience** (drawer) — reading-progress indicator, sticky report
    metadata, anchor navigation (Summary / Timeline / Traceability / Related),
    improved long-form typography, mobile-optimized single-column layout.

---

## Public safety review

- Only **published/archived publications** (already public via RLS) are surfaced.
  Fields: title, summary, category bucket, derived risk tier, publication date,
  evidence/source **counts**, traceability score, confidence, review status.
- **No raw source identities, no reviewer identities, no PII** — the traceability
  center explicitly states identities are withheld by design.
- Risk is a derived presentational tier (Phase 43 mapping). Corrections/version are
  shown as honest status ("None on record" / "Current (1.0)"), not fabricated data.
- Narrative map + activity feed are aggregate/real-event only. Related items are
  real same-category reports; narrative types/categories come from a static
  taxonomy. No invented recommendations.
- Empty/zero everywhere when there is no public data (sandbox/CI): explorer shows
  "No research reports published yet.", activity shows the empty state.

---

## Performance impact

- Read-only + cached; two cached reads via `Promise.all` (shared cache tag with the
  homepage/library). No N+1: a single bounded `hsin_publications` read (≤300) backs
  cards, facets, narrative counts, and sort; search/sort/paginate are in-memory.
- Cards paginate (9/page, "Load more"); the detail drawer mounts only when opened
  (`AnimatePresence`), so the heavy reading panel is never in the initial payload.
- No client-bundle growth from the server lib (type-only imports). All animations
  (drawer slide, timeline pulse) and smooth-scroll respect `prefers-reduced-motion`.

---

## Screenshots

Not capturable in this environment (no browser runner). Verify on a preview deploy
at `/research-reports`: the trust strip, the narrative map + activity feed row, the
explorer (facet rail + sort + briefing cards), and the report drawer (progress bar,
anchor nav, executive summary, timeline, traceability center, related). Mobile
collapses to a single column; the drawer is full-width.

---

## Files

**Added**
- `apps/web/components/research-reports/ReportsExplorer.tsx` — search/facets/sort/cards/pagination.
- `apps/web/components/research-reports/ReportDetailDrawer.tsx` — exec summary, timeline, traceability, related, reading UX.
- `apps/web/components/research-reports/NarrativeMap.tsx` — relationship graph + live counts.
- `apps/web/components/research-reports/ReportActivityFeed.tsx` — real activity feed.
- `apps/web/components/research-reports/TrustStrip.tsx` — trust & governance signal.
- `docs/PHASE_45_RESEARCH_REPORTS_INTELLIGENCE_CENTER.md` — this report.

**Changed**
- `apps/web/app/(marketing)/research-reports/page.tsx` — live Intelligence Center (CMS-first guard preserved); was static demo.

> Reuses `lib/public-intelligence.ts` (`getSignalLibraryData`, `getPublicActivityFeed`)
> and `lib/public-intelligence-mapping.ts` — no changes required to the data layer.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `/research-reports` → 6.26 kB (161 kB first load), server-rendered on demand with the cached data layer.
