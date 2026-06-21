# Phase 74 — Executive Intelligence & Early Warning

**Status:** Complete (uncommitted) · **Type:** Additive (intelligence/monitoring layer)
**Route:** `/dashboard/executive-intelligence` (reviewer+) · **Migration:** none
**Public docs:** `/docs/executive-intelligence`

A DETECTION layer (not prediction) over existing HSI intelligence. It answers
"what should I be paying attention to right now?" using deterministic,
explainable, reproducible rules over real data. No black-box scores, no AI risk
ratings, no fabricated metrics. Human review remains authoritative. No changes to
auth, ingestion, publishing, review, forecasting, narrative, or evidence
workflows.

> **Route note:** `/dashboard/executive` is the Phase 26 executive command
> center; this new surface lives at **`/dashboard/executive-intelligence`**.

## Architecture audit (reuse)
- `lib/operations-center/data.getOperationsCenter` — overview, mission (platform
  health), attention, intelligence health (source/signal/trust/map), narrative &
  forecast & geo & transparency watch, timeline. The primary input.
- `lib/platform-audit/data.getPlatformAuditReport` — infra/supabase/storage/
  migration subsystem checks for platform health signals.
- `lib/forecasts/persistence` (`listForecastsDal`, `scoredForecastsDal`) — forecast
  divergence inputs.
- `lib/operations-center/mission` (`ratioStatus`/`inverseRatioStatus`/
  `backlogStatus`) — reused for risk thresholds.

## Files created
- Pure: `lib/executive/{types,divergence,warnings,risk,brief}.ts`
- Server: `lib/executive/data.ts` (`getExecutiveIntelligence`)
- UI: `components/executive-intelligence/panels.tsx`
- Route: `app/dashboard/executive-intelligence/page.tsx`
- Tests: `lib/executive/executive.test.ts`
- Docs: this file + the `/docs/executive-intelligence` page (in `lib/docs/content.ts`)

## Files modified
- `lib/security/rbac-audit.ts` (PROTECTED_ROUTES reviewer+)
- `packages/ui/src/nav-roles.ts` (NAV_VISIBILITY + ALL_NAV_HREFS)
- `packages/ui/src/navigation.tsx` (sidebar entry, Intelligence group)
- `lib/docs/content.ts` (added the executive-intelligence doc page)

## Alert framework
The proposed `executive_alerts` shape (`id, type, severity, title, summary,
source_count, signal_count, narrative_count, region_count, status, created_at`) is
implemented as a **deterministically computed** `ExecutiveAlert` model —
reproducible from data, so no migration/table is required (status defaults OPEN;
acknowledge/resolve persistence is documented future work). Severity:
`INFO/LOW/MEDIUM/HIGH/CRITICAL`. Eight rules (`lib/executive/warnings.ts`):
Narrative Surge, Contradiction Spike, Evidence Gap, Forecast Divergence, Trust
Degradation, Geographic Expansion, Review Backlog, Source Failure — each with
documented thresholds and a summary stating the trigger + real numbers.

## Executive dashboard layout
Executive Overview (active signals / open investigations / review queue /
published reports) → Risk Monitor (overall + 8 cards) → Early-Warning Alerts →
Executive Brief → Trust + Forecast Health → Forecast Divergence table → Blind
Spot / Contradiction / Geo monitors → Narrative Velocity → Platform Health
Signals.

## Risk methodology
Eight categories (`lib/executive/risk.ts`), each GREEN/YELLOW/RED via the reused
mission thresholds: Narrative & Trust & Forecast & Collection use
`inverseRatioStatus` (lower bad ratio is better), Evidence & Geo use `ratioStatus`
(higher coverage is better), Operational & Review use `backlogStatus`. Each card
prints the exact numbers behind its status. Overall = worst category.

## Forecast divergence design
`classifyDivergence` maps real status + evaluation result to
`on_track / diverging / missed / unresolved`: resolved+correct→on-track,
resolved+partial→diverging, resolved+incorrect→missed, active-overdue→diverging,
active-in-progress→on-track, expired→missed. Each row carries age, owner,
confidence, and outcome for traceability. It reads outcomes; it never forecasts.

## Documentation added
`/docs/executive-intelligence`: Purpose, Methodology, Alert Types, Risk
Categories, Forecast Divergence, Executive Briefs, Governance, Transparency Rules,
Limitations.

## Test results
- `tsc --noEmit` (apps/web): clean
- `lib/executive/executive.test.ts`: 14 (divergence, all warning rules incl.
  empty/no-fabrication + reproducibility, risk categories + empty-universe, brief
  sections/deltas); nav invariant + docs: pass — **55/55** in the targeted run.
- Full suite + clean build: see final report.

## Limitations
- Alert acknowledge/resolve is not persisted (computed-OPEN); a table is the next
  step if workflow state is needed.
- Narrative surge uses platform-level new-narrative velocity (7d vs prior) and Geo
  Expansion uses current geographic footprint as proxies until per-entity time
  series are wired — documented, never fabricated.
- The page composes several heavy aggregators; it is force-dynamic and uncached
  (per the 73.3 cookies-in-cache hotfix). A shared bundle could optimize later.
