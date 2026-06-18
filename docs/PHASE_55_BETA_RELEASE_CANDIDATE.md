# Phase 55 — Beta Release Candidate Command Center

The capstone. A single screen at `/dashboard/release-candidate` that answers **"can
we launch beta today?"** by composing every intelligence layer built in phases
43–54 into one launch-readiness system: platform readiness, system health, beta
operations, intelligence health, alerts & risks, network readiness, trust &
governance, an executive launch brief, and a pass/warning/fail release checklist —
all from real metrics, read-only.

**Untouched:** RBAC, IAM, auth, middleware, Stripe, billing, compliance, signal /
review / publication / source workflows, **and the database schema**. No new
workflows, no new data models, no new queries — pure composition.

---

## Architecture

```
getReleaseReadiness(role)  — Promise.all over the existing cached layers (all deduped):
  public-intelligence    (metrics, signal library)
  source-intelligence    (source health, coverage)
  operations-intelligence(review ops, pipeline)
  trust-intelligence     (trust overview, scorecard, audit)
  alerts-intelligence    (critical alerts, health)
  forecasting-intelligence (outlook, momentum, early warnings)
  collaboration-intelligence (workload pressure, source concentration)
  contributor-network    (coverage, quality, network health, role counts*)
        ▼
app/dashboard/release-candidate/page.tsx  (SERVER, force-dynamic, researcher+)
  Status banner (Part 1/3) · Platform readiness (2) · System health (3) ·
  Release checklist (10) · Executive launch brief (9) · Alerts & risks (6) ·
  Network readiness (7) · Beta operations (4) · Intelligence health (5) ·
  Trust & governance (8)
```
\* aggregate role counts are admin-only (via contributor-network → beta-operations).

## Readiness model

The 7-item **release checklist** is the backbone (Part 10), each scored
Pass / Warning / Fail:

| Check | Pass / Warning / Fail |
|---|---|
| Platform stable | 0 failing sources & 0 critical alerts / ≤3 failing / else |
| Review workflow healthy | backlog ≤15 / ≤50 / >50 |
| Sources healthy | 0 failing / ≤2 failing / else |
| Coverage acceptable | 0 gaps / ≤2 gaps / else |
| Trust thresholds met | traceability ≥90% / ≥80% or no reports yet / else |
| Contributor capacity sufficient | reviewers&researchers >0 (admin) or Low backlog pressure / partial / else |
| No critical alerts | 0 critical open / — / >0 |

## Launch scoring

- **Readiness score** = Σ(check points) ÷ (checks × 2) × 100, where Pass=2,
  Warning=1, Fail=0.
- **Overall status:** `READY` (all pass) → `MONITORING` (warnings only) → `AT RISK`
  (some fails) → `NOT READY` (a hard fail — critical alerts or platform unstable —
  or ≥2 fails). Every non-pass check is listed as a status reason.

## Risk scoring

Alerts & risks surface **only triggered conditions** (critical alerts, coverage
gaps, reviewer bottleneck, source failures, publication delays, and forecast early
warnings) with high/medium severity. **Network readiness score** = coverage
strength − dependency-risk penalty − backlog-pressure penalty, with the formula
shown on the panel. The launch brief derives strengths/risks/warnings/coverage gaps
directly from the checklist + coverage, and a plain-language recommendation from the
status.

## Role access (Part 11)

- **Gate:** researcher+ via the existing `canResearch`; RBAC + middleware still
  enforce. No permission changes.
- **Admins** see the full picture incl. aggregate contributor/reviewer/admin counts,
  growth, and retention. **Researchers / reviewers** see the same read-only
  readiness summary; admin-only user counts render as "—". Everyone sees the status,
  checklist, system health, alerts, and launch brief.

---

## Performance

- A single `Promise.all` over **9 cached getters** — all `unstable_cache`-backed and
  deduped, so the deep composition collapses to ≤1 DB pass per cache window. No
  duplicate queries, no N+1. Fully server-rendered (no client islands).

## Public safety

- Aggregates + explainable status/scores only; reuses each layer's public-safe
  output. No PII/identities (role counts are aggregate, admin-only). Empty/zero and
  "no triggered conditions" states throughout — recommendations are generated only
  from real metrics.

---

## Files

**Added**
- `apps/web/lib/release-readiness.ts` — composed launch-readiness model + checklist + scoring (read-only).
- `apps/web/components/release-candidate/panels.tsx` — status banner, metric grids, system health, alerts & risks, network readiness, launch brief, checklist.
- `apps/web/app/dashboard/release-candidate/page.tsx` — Beta Release Candidate Command Center.
- `docs/PHASE_55_BETA_RELEASE_CANDIDATE.md` — this report.

> Composes all phase 43–54 intelligence layers. No new queries, data models, or
> workflow/permission changes.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build` (clean `.next`): **exit 0, "Compiled successfully"**; `ƒ /dashboard/release-candidate` → 286 B (110 kB first load), fully server-rendered.
