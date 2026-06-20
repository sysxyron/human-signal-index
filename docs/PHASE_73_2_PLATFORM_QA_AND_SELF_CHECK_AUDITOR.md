# Phase 73.2 — Platform QA, Copy Humanization & Self-Check Auditor

**Status:** Complete (uncommitted) · **Type:** Additive / fix-only
**Route:** `/dashboard/platform-audit` (admin-only) · **Migration:** none

A QA pass over the public marketing copy plus a deterministic, admin-only
Platform Self-Check Auditor. No auth/ingestion/publishing/review changes; no
fabricated metrics or audit results; human review remains authoritative.

---

## Part 1 — Copy QA

### Pages reviewed
`/` (homepage), `/beta`, `/demo`, `/about`, `/methodology`, `/transparency`,
`/contact`, `/subscribe`, plus the app sign-in CTAs (via `appHref('/sign-in')`).
The pre-existing pages were already in a credible, evidence-first voice; the
newest copy (`/beta`, `/demo` from Phase 73.1) carried the most AI-flavored
phrasing and em-dash density, so the edits focused there.

### Tone rules applied
Human, serious, evidence-first, public-interest aligned, confident without hype.
Vocabulary kept: *evidence-backed, public-source focused, human-reviewed,
provenance-aware, transparent, forecast accountability, correction tracking*.
Avoided: "revolutionary", "game-changing", "AI-powered truth", "guarantees
truth", "replaces analysts", excessive em dashes and hyphenated stacks.

### Copy changes made
- `/beta` — rewrote the "What HSI does" bodies and the Trust list to drop em
  dashes in favor of plain sentences ("Everything is human-reviewed and nothing
  is auto-published" instead of "— human-reviewed, never auto-published");
  softened "No hidden black-box trust scoring —" to "No hidden trust scoring. The
  methods are explainable." Header "Investigate & build" → "Investigate and build".
- `/demo` — removed the overclaim "defensible … in court of public opinion" →
  "holds up in review and in print"; de-dashed the "Built for teams" bodies;
  "No black-box automation of judgment" → "Judgment is never automated away".
- `/` — (Phase 73.1) CTA already links to Beta/Demo with a clear secondary
  "Or submit a signal for review" link.

### UX issues fixed / checked (Part 2)
- Beta ↔ Demo cross-links and app sign-in links present on both pages (verified).
- Homepage → Beta/Demo links present.
- Forms have explicit success + error states with a mailto fallback (Phase 73.1).
- SEO metadata (title/description/canonical/OpenGraph) present on `/beta`, `/demo`.
- No duplicate page titles introduced; buttons use the shared `Button` variants;
  layouts are responsive (grid → stack) via the existing design system.

---

## Part 3–6 — Platform Self-Check Auditor

### New route
`/dashboard/platform-audit` (admin-only — added to `PROTECTED_ROUTES`,
`NAV_VISIBILITY`, `ALL_NAV_HREFS`, and the sidebar). Read-only.

### Checks implemented (all deterministic, real inputs)
| Area | Check | Source |
|---|---|---|
| routing | NAV_VISIBILITY ⊆ ALL_NAV_HREFS | nav-roles registries |
| rbac | every restricted nav route has a PROTECTED_ROUTES gate | rbac-audit vs nav-roles |
| environment | presence of required/recommended/optional env vars (presence only, never values) | `process.env` |
| metadata | NOT_OBSERVED (Next metadata isn't runtime-introspectable) | static review |
| supabase / storage / infrastructure | subsystem probe states mapped to status | `lib/infra/probes` |
| migrations | applied vs missing | `lib/launch` migration audit |
| infrastructure | recent error/critical event count | `infra_events` |
| conversion / forms | `/beta` `/demo` routes + intake APIs present; form backend wired? | route registry |

### Audit result model
Statuses `PASS · WARNING · FAIL · NOT_OBSERVED · NOT_CONFIGURED`; severities
`LOW · MEDIUM · HIGH · CRITICAL`. Every issue carries title, status, severity,
area, explanation, recommended fix, source, and timestamp. A check that cannot
run returns NOT_OBSERVED / NOT_CONFIGURED — never a fabricated PASS/FAIL.

### Self-check methodology
Pure check functions (`lib/platform-audit/checks.ts`) turn real inputs into
issues; `summary.ts` computes counts, worst-first ordering, recommendations, and
a **readiness score**: start at 100, subtract per FAIL (CRITICAL 25 / HIGH 15 /
MEDIUM 8 / LOW 3) and half that per WARNING; NOT_OBSERVED / NOT_CONFIGURED never
penalize (they can't be assessed); clamped 0–100. Overall = RED if any FAIL,
YELLOW if any WARNING, else GREEN. The DAL (`data.ts`) gathers inputs and never
throws (degrades to NOT_OBSERVED). It is **not** cached (reflects live state and
reads cookies — consistent with the Phase 73.1 hotfix).

### Report view (Part 5)
Overall health + readiness score, status/severity counts, recommended next
actions, and per-area tables: Route & RBAC, Metadata, Infrastructure & data,
Environment, and the Conversion funnel checklist.

### PDF readiness (Part 6)
`PlatformAuditReport` already carries `{ title, generatedAt, summary, checks,
issues, recommendations }` — the exact shape a future PDF exporter needs. The UI
shows a **disabled "Export PDF Report"** button labelled *"PDF export will be
enabled in a future reporting phase."* No PDF library was added.

---

## Part 7 — Tests added
`lib/platform-audit/platform-audit.test.ts` (15): route/nav/RBAC mismatch
detection, env presence (required/recommended/optional, never exposes values),
subsystem state mapping, migration status, error-event thresholds, conversion
checklist, issue sorting, readiness score (incl. NOT_* never penalizing + clamp),
summary counts + overall status, empty-state (no fabrication), recommendations.

## Verification results
| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Platform-audit unit tests | ✅ 15/15 |
| Nav-roles invariant (route added) | ✅ pass |
| Full suite (tracked + untracked) | ✅ (see report) |
| `next build` (clean `.next`) | ✅ route present |
| RBAC (admin-only) unchanged elsewhere | ✅ |

## Future improvements
- Build-time metadata lint to convert the metadata check from NOT_OBSERVED to a
  real PASS/FAIL.
- Optional live HTTP route probing (self-fetch) for true availability checks.
- Wire the PDF exporter against `PlatformAuditReport`.
- Persist audit runs for trend history.

## Phase 74 readiness impact
The auditor gives Phase 74 (Executive Intelligence & Early Warning) a real,
deterministic system-health substrate: mission-style GREEN/YELLOW/RED, a readiness
score, and an attention-ready issue feed — all from genuine checks, ready to feed
early-warning thresholds and an executive report (and, later, PDF export).

Left **uncommitted** per your standing preference.
