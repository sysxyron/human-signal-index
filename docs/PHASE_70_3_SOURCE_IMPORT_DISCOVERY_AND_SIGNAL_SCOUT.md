# Phase 70.3 — Source Import, Discovery Agent & Signal Scout

**Status:** Complete (uncommitted) · **Type:** Additive, human-gated source onboarding
**Route:** `/dashboard/source-discovery` (reviewer+; admins import + run agents)
**Migration:** `0057_source_discovery_and_import.sql` (additive)

Expands the Source Registry with **bulk CSV import, duplicate detection,
deterministic classification, agent-suggested candidates, and a signal scout** —
**all human-reviewed.** Nothing auto-activates a source or auto-publishes a signal;
approval creates a **PAUSED** source (monitoring disabled). No ingestion / review /
publishing / collection workflow changed. No crawling, no paywall/auth/robots
bypass, no dark-web access, no fabricated URLs/metadata/signals.

---

## Architecture

```
lib/source-discovery/
  types.ts       PURE — CSV vocabulary, candidate/duplicate/classification shapes
  csv.ts         PURE — RFC-4180-ish parser + row validation/normalization
  classify.ts    PURE — deterministic HSI category (A/B/C/D/Foundation) + source_type
  duplicates.ts  PURE — exact/domain/feed/related detection (+ domainOf)
  matching.ts    PURE — narrative/watchlist/source suggestion (keywords/domain)
  persistence.ts DAL — batches/rows/candidates/reviews/runs/findings/signal_candidates
  engine.ts      import / approve / reject / runSourceDiscovery / runSignalScout
  service.ts     RBAC (reviewer+ review; admin import + agents)
  data.ts        dashboard composition
  actions.ts     server actions (audited)

app/dashboard/source-discovery/page.tsx     reviewer+ dashboard
components/source-discovery/                 panels (server) + Controls (client)
supabase/migrations/0057_*.sql              7 tables + seeds 2 agents, RLS
```

Reuses: Phase 62 notifications (admin alerts), Phase 66 agent framework (2 new
agents), the existing `hsin_sources` registry (approval target), `narratives` +
`hsin_watchlists` (matching). No duplicated logic.

---

## Import flow

1. Admin uploads a CSV (file or paste) → `parseCsv` + `toObjects` (header-driven).
2. Each row → `validateRow` (require name + a URL; validate scheme, source_type,
   risk 1–5, interval). Invalid rows are recorded with explicit errors.
3. Valid rows → `classifySource` (deterministic) + `detectDuplicate` (vs registry).
4. Staged as `source_candidates` (`pending_review`, or `duplicate` if exact).
5. Batch summary recorded; admins notified (`SOURCE_IMPORT_COMPLETED`,
   `SOURCE_DUPLICATE_DETECTED`, `SOURCE_CANDIDATE_READY`). **No activation.**

CSV columns: `source_id, category, source_name, source_type, primary_url,
feed_or_api_url, platform, capture_interval_minutes, baseline_risk_1_5,
content_selector, priority, ingestion_mode, tags, description, corroboration_rule,
notes, status`.

## Classification model (deterministic, no LLM)

Categories: **A** Extremism/Ideology · **B** Public Trust · **C** OSINT/Research ·
**D** Media · **Foundation** Platform Infrastructure. `source_type`: website / rss
/ government / court / research / podcast / youtube / social / forum / api /
archive / watchlist / threat_feed / newswire. Explicit CSV category/type win
(confidence 0.95); otherwise keyword + URL inference with a confidence + an
explainable reason. Never fabricates a label — it labels what the inputs contain.

## Duplicate model

`detectExactDuplicate` (identical URL → **blocks approval**), `detectDomainDuplicate`
/ `detectFeedDuplicate` / `detectRelatedSource` (→ **reviewer confirmation
required**). Each candidate stores `duplicate_status`, `existing_source_id`,
`existing_source_name`, `duplicate_reason`, surfaced in the UI with a badge.

---

## Review workflow

Statuses: `pending_review · approved · rejected · needs_changes · duplicate ·
archived`. **Approve** → writes a `hsin_sources` row with `status='paused'` +
`monitoring_enabled=false` (activation is a separate manual step) and links
`source_id`. **Reject / needs-changes** → stores the reviewer reason. Every
decision appends to `source_candidate_reviews` (immutable audit). Exact duplicates
cannot be approved; domain/feed/related require an explicit "Confirm & approve".

---

## Agent design (Phase 66 framework)

- **SOURCE_DISCOVERY_AGENT** (weekly): scans `hsin_evidence_claims.source_ref` for
  domains **already referenced in real evidence** but not in the registry, ranks by
  reference count, and stages the **real referenced URL** as a candidate (never
  fabricates a URL). Records findings; all results enter review.
- **SIGNAL_SCOUT_AGENT** (daily): scans recent **real** `hsin_signals` and suggests
  `signal_candidates` only where there's a genuine narrative/watchlist match
  (`matchSignals`), with confidence + reason. **Never publishes** — a signal
  candidate is a review-queue suggestion to link an existing signal, not a new signal.

Both run via the existing agents cron and the admin "Run" buttons; both emit Phase
62 notifications (`SOURCE_DISCOVERY_COMPLETED`, `SIGNAL_CANDIDATE_READY`).

## Matching engine

`matchNarratives` / `matchWatchlists` / `matchSources` / `matchSignals` — pure,
deterministic (domain / keyword / tag / term overlap). **AI may suggest; humans
approve.** Matches are surfaced, never auto-applied.

---

## Map readiness

`source_candidates` carries optional `country/region/city/latitude/longitude/
geo_confidence/geo_source`. **Coordinates are never fabricated** — stored only when
verified, imported, or explicitly supplied. Unlocated sources remain valid. This
prepares the Phase 71 Global Intelligence Map (per the 70.2 strategy) without
building it here.

## Dark-web strategy (documentation only — NOT built)

HSI does **not** crawl the dark web, TOR, or credentialed/private services.
- **Risks:** legal exposure, privacy violations, operational compromise, malware.
- **Recommended future integrations (public, licensed, API-based — review-gated):**
  AbuseIPDB, FeodoTracker, URLHaus, AlienVault OTX, MITRE ATT&CK, NVD, CISA KEV,
  GitHub Security Advisories, PhishTank. These enter the same candidate/review
  pipeline; none implies crawling.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| CSV/classify/duplicate/matching + agent + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2778 / 2778** pass, 0 fail |
| `next build` (clean `.next`) | ✅ compiled; `/dashboard/source-discovery` → `ƒ` |
| Migration registered (0001→0057) | ✅ 57/57 |
| No workflow regressions / no auto-activation / no auto-publishing / no dark-web crawling | ✅ |

---

## Completion report

- **Files added:** `lib/source-discovery/` (types, csv, classify, duplicates,
  matching, persistence, engine, service, data, actions) + 1 test; `components/
  source-discovery/` (panels, Controls); dashboard page; doc.
- **Routes added:** `/dashboard/source-discovery` (reviewer+).
- **Migration added:** `0057_source_discovery_and_import.sql` (7 tables, RLS,
  seeds 2 agents).
- **Agent additions:** `SOURCE_DISCOVERY_AGENT` + `SIGNAL_SCOUT_AGENT` (Phase 66
  registry + handlers; now 11 agents).
- **Classification model:** deterministic A/B/C/D/Foundation + 14 source types,
  confidence + reason.
- **Duplicate model:** exact (blocks) / domain / feed / related (confirm) / none.
- **CSV import:** validate → classify → dedupe → stage candidates; batch summary;
  no activation.
- **Review behavior:** approve → PAUSED source; reject/needs-changes → reason;
  audited.
- **Discovery behavior:** suggests candidates from real referenced domains; review-
  gated.
- **Signal scout:** suggests narrative/watchlist links for real recent signals;
  never publishes.
- **Map readiness:** optional, never-fabricated geo fields on candidates.
- **Dark-web recommendation:** no crawling; public licensed threat-intel APIs via
  the same review pipeline, later.

Left **uncommitted** per your standing preference.
