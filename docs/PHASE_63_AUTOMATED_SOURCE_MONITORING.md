# Phase 63 — Automated Source Monitoring

**Status:** Complete (uncommitted)
**Route:** `/dashboard/source-monitoring` (reviewer+; admins also run it)
**Cron:** `/api/cron/source-monitoring` (CRON_SECRET-guarded, service-role)
**Migration:** `0050_source_monitoring.sql` (additive)

Turns HSI from passive observability into **active monitoring**: it automatically
detects source failures, recoveries, stale sources, collection gaps, and
reliability regressions from existing telemetry, then raises alerts and
notifications. It **observes and reports — it never circumvents**: no robots.txt /
Cloudflare / login / CAPTCHA / rate-limit bypass, and no change to ingestion,
crawler, cadence, adapters, or the scheduler.

```
Phase 61 (observe health) ──► Phase 63 (detect + classify) ──► Phase 62 (notify)
                                     │
                          Source Event → Classification → Alert → Notification → Executive Summary
```

---

## Architecture

```
lib/source-monitoring/
  types.ts       PURE — state model, alert vocabulary, data shapes, kind→type map
  policy.ts      PURE — stale windows, band ladder, COMPUTED severities, trend analysis
  classify.ts    PURE — evaluateSourceHealth + 5 detectors + generateMonitoringAlerts
  persistence.ts DAL  — read prior/alerts/events, persist state/events/alerts,
                        resolve admin recipients, emit via Phase 62 DAL + gating
  engine.ts      runSourceMonitoring() — the one I/O orchestrator
  data.ts        getMonitoringDashboard() — reviewer+ read composition (live + history)
  actions.ts     runSourceMonitoringAction / acknowledgeAlertAction (admin, audited)

app/dashboard/source-monitoring/page.tsx       reviewer+ dashboard
app/api/cron/source-monitoring/route.ts        automatic scheduled run (service-role)
components/source-monitoring/                   panels (server) + RunMonitoringButton (client)
supabase/migrations/0050_source_monitoring.sql  state / events / alerts (RLS)
```

**Consumes Phase 61** (`getSourceReliability`) as its only telemetry source — no
new reads of ingestion internals, no fetching. Phase 61's `ReliabilitySource` was
extended **additively** with `lastSuccessIso` + `lastSuccessAgeDays` (recency the
stale detector needs); nothing else in Phase 61 changed.

**Integrates with Phase 62** by reusing its notification DAL (`insertNotificationDal`)
+ delivery gating (`shouldDeliver`) + preferences — Phase 62 code is unchanged.

The detectors are **pure and edge-triggered**, so they're fully unit-tested and a
still-failing source is not re-alerted every run.

---

## Source state model (Deliverable 2)

`HEALTHY · WARNING · DEGRADED · STALE · BLOCKED · UNREACHABLE · FAILED · RECOVERED`

`evaluateSourceHealth(signal, prior, now)` returns an **explainable** classification
— `{ state, reason, evidence, score, lastSuccess, lastFailure }`. Precedence:

1. **RECOVERED** — healthy now, prior state was a problem.
2. **BLOCKED** — anti-bot/login protection present + not healthy (reported, never bypassed).
3. **UNREACHABLE** — Offline/Timeout failure while FAILED.
4. **FAILED** — Phase 61 status FAILED (score < 60).
5. **STALE** — no successful collection within the type's policy window.
6. **DEGRADED** — WARNING with a band drop vs the prior score.
7. **WARNING** — at-risk (score 60–79).
8. **HEALTHY** — otherwise.

Evidence carries score, tier, success %, events, consecutive failures, failure
type, protection, age, and policy. Scores are **never fabricated** — they come from
Phase 61's explainable health score.

---

## Alert model (Deliverable 3)

Kinds: `SOURCE_FAILED · SOURCE_RECOVERED · SOURCE_BLOCKED · SOURCE_STALE ·
SOURCE_DEGRADED · COLLECTION_GAP · RELIABILITY_DROP`.

Detectors (each fires on a **transition**, one alert per source/run by precedence
recovery → failure/blocked → stale → gap → regression):

| Detector | Fires when |
|---|---|
| `detectSourceRecovery` | bad → healthy |
| `detectSourceFailure` | newly FAILED/UNREACHABLE (→ `SOURCE_FAILED`) or newly BLOCKED (→ `SOURCE_BLOCKED`) |
| `detectStaleSource` | newly past the stale window (→ `SOURCE_STALE`) |
| `detectCollectionGap` | a previously-active source records 0 attempts (→ `COLLECTION_GAP`) |
| `detectReliabilityRegression` | score band drops — 1 band → `SOURCE_DEGRADED`, ≥2 → `RELIABILITY_DROP` |

### Severity — computed, never hardcoded

| Alert | Severity rule |
|---|---|
| Failure / unreachable | `CRITICAL` if score 0 or ≥5 consecutive failures; else `WARNING` |
| Blocked | `WARNING` (CRITICAL only when fully dead) |
| Stale | by ratio `daysStale/policy`: ≥4 → CRITICAL, ≥2 → WARNING, else NOTICE |
| Collection gap | `WARNING` |
| Reliability drop | by bands dropped: 3 → CRITICAL, 2 → WARNING, 1 → NOTICE |
| Recovery | `NOTICE` |

All derived from ratios/bands — explainable, no magic single threshold.

---

## Notification flow

The kinds map onto the **fixed** Phase 62 type set (Phase 62 is not modified):
`SOURCE_RECOVERED` → `SOURCE_RECOVERED`; everything else → `SOURCE_FAILURE`. The
precise kind, state, and score delta travel in the notification **title +
metadata**; the full alert is stored in `source_monitoring_alerts`.

Recipients are **admins** (resolved via `user_roles → roles`); each delivery honors
the recipient's Phase 62 preferences (`shouldDeliver` — source-alerts category,
critical-only, in-app). The first created notification id is linked back to the
alert row. **Cold start** (no prior state) persists a baseline + the alert feed but
**suppresses the notification flood**; subsequent runs notify on transitions only.

Triggers:
- **Automatic:** `/api/cron/source-monitoring` (service-role, CRON_SECRET).
- **Manual:** admin "Run monitoring now" (`runSourceMonitoringAction`, audited via `recordSecurityAudit`).

---

## Monitoring policies (Deliverable 5)

Stale windows by source type (`STALE_POLICY`): RSS/Reddit/Social 24h · Website/API
48h · Government/Forum/YouTube 72h · Research 7d · Podcast 14d · Other 72h. The
dashboard shows the stale reason + days stale; staleness raises `SOURCE_STALE`.

---

## Reliability calculations (Deliverable 6)

`reliabilityTrend(scores[])` over the persisted per-source score history (event
log): average-of-halves with a ±3-point deadband. `<3` data points →
**Insufficient Data** (never a fabricated trend line); otherwise **Improving /
Stable / Declining** with an explained Δ. Score bands come from Phase 61's tiers
(Excellent / Healthy / At Risk / Failing).

---

## Database (Deliverable 9) — migration 0050

- **`source_monitoring_state`** — current per-source snapshot (one row/source):
  state, reason, score, prev_score, last_success_at, last_failure_at, days_stale,
  evidence jsonb, evaluated_at, audit timestamps.
- **`source_monitoring_events`** — append-only transition log (from/to state, kind,
  reason, score, evidence) — also the trend score history.
- **`source_monitoring_alerts`** — the alert feed (kind, severity, state, reason,
  evidence, score before/after, recency, `notification_id`, acknowledge fields).

`source_id` is **text, no FK** — monitoring is observational and must not break if a
source is removed. **RLS:** reviewer+ read (`is_reviewer_or_above`), admin manage
(`is_admin`); the service-role cron bypasses RLS server-side. The migration is
**idempotent** (create-if-not-exists + add-column-if-not-exists before dependent
indexes + drop-policy-if-exists), following the 0048/0049 lessons. Additive: no
existing object is modified.

---

## Dashboard (Deliverable 4 / 7)

`/dashboard/source-monitoring` (reviewer+): executive summary ("Can we trust our
source network today?" with a computed verdict), overview (total/healthy/warning/
failed/blocked/stale/degraded/unreachable), collections (fetches/day, success %,
failure %, avg response), health trends (reliability distribution + state-change /
failure / recovery counts), reliability trends per notable source, and the alert
feed. Overview/collections/executive are **live** from Phase 61; the alert feed +
change counts + trends come from persisted history. Admins get the run control.

---

## Security (Deliverable 10)

No public APIs (cron is CRON_SECRET-guarded; dashboard is reviewer+ via middleware
+ RLS + page self-gate). No anonymous access. No source credentials or crawler
secrets are read or exposed. **No bypass / scraping workaround of any kind** —
monitoring consumes telemetry only.

---

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` (apps/web) | ✅ clean |
| Monitoring + nav + migration tests | ✅ pass |
| Full suite (tracked + untracked) | ✅ **2709 / 2709** pass, 0 fail |
| `next build` (clean `.next`) | ✅ success; `/dashboard/source-monitoring` + `/api/cron/source-monitoring` → `ƒ` |
| Migration idempotency | ✅ re-runnable |
| No regressions / no fabricated metrics | ✅ all values computed; ingestion untouched |

> Migrations `0048`–`0050` must be applied to Supabase before these surfaces
> read/write live data; everything degrades gracefully to empty until then.

---

## Known limitations

- **No email/real-time push** — alerts are in-app (Phase 62); email is a later phase.
- **Trend history accrues over runs** — trends read "Insufficient Data" until ≥3
  transition score points exist for a source (honest, not fabricated).
- **Collection-gap detection** is window-based (0 attempts for a previously-active
  source); it does not distinguish a scheduler pause from a true outage — both are
  reported for an operator to judge.
- **Recipients are admins** — reviewer-targeted routing is future work.
- **Cron schedule** must be registered in the deployment (Vercel cron) to run
  automatically; the admin "Run now" button works immediately.

---

## Future integrations

- **Phase 64 Evidence Graph** — monitoring events/alerts become graph nodes (source
  reliability as evidence provenance).
- **Phase 65 Narrative Intelligence** — coverage-gap + category-risk signals feed
  narrative blind-spot detection.
- **Phase 66 Agent Automation** — the engine's `runSourceMonitoring` is the hook an
  agent loop can call/extend; alert kinds become agent triggers.
- The alert/notification substrate (Phase 62 + 63) is reusable for any future
  automated detector.
