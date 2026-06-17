# Phase 51 — Alerts & Watchlists Engine

`/dashboard/watchlists` is now a unified intelligence **alerting surface** that
answers "what changed? what needs attention? what should I watch?" — built
**read-only** by composing the existing cached intelligence layers. **No
notifications are sent** (no email/SMS/push/webhooks); this phase only generates
intelligence watchlists and alerts and reserves the notification architecture.

**Untouched:** RBAC, IAM, auth, middleware, Stripe, billing, compliance, existing
workflows, and the existing review process. The Phase 7 **custom watchlist
workflow** (create form + cards) is fully preserved below the new alerting layer.

---

## Architecture & data flow

```
public-intelligence.ts   → getPublicIntelligenceBundle()  (metrics, activityFeed, categoryActivity)
                         → getSignalLibraryData()          (risk facets, trends, cases)
source-intelligence.ts   → getSourceIntelligence()         (health, coverage, analytics)
operations-intelligence  → getOperationsIntelligence()     (pipeline, review ops)
        ▼ getAlertsIntelligence()  (Promise.all over 4 cached sources — NO new queries, NO N+1)
app/dashboard/watchlists/page.tsx  (SERVER, force-dynamic)
  • Executive alert summary  Part 8   • Alert health            Part 9
  • Watchlist registry       Part 1 (client cards → detail drawer Part 7)
  • Alert feed               Part 2   • Alert severity           Part 3
  • Emerging narratives      Part 4
  • Source alerts            Part 5   • Review alerts            Part 6
  • Notification channels    Part 10 (reserved architecture, no sending)
  + existing Phase 7 custom watchlists (create form + cards) — preserved
```

Watchlist detail (recent reports, source contribution) is **precomputed
server-side and embedded** in each watchlist object, so the client detail drawer
reads from props — no client fetch, no extra round-trips.

---

## Alert model

`Alert = { id, type, severity, title, detail, at, watchlist? }`. Alerts are
**generated** from real platform state (there is no alert table to read):

| Type | Trigger (real data) |
|---|---|
| `RISK INCREASE` | critical/high-risk findings present |
| `SOURCE FAILURE` | sources in failing state |
| `REVIEW BACKLOG` | pending review count above threshold |
| `TRACEABILITY DROP` | average traceability below 80% |
| `NEW SIGNAL` / `NEW EVIDENCE` / `PUBLICATION` / `SOURCE RECOVERY` | mapped from the public activity feed (with the event's timestamp) |

Condition alerts (current state) are stamped "now"; event alerts carry their real
timestamp. The feed sorts newest-first, severity-breaking ties. Empty → "the
platform is quiet."

## Severity model

`Critical > High > Moderate > Low > Informational` (rank 5→1). The engine reports
**count**, **distribution** (per severity), an **activity trend**, **critical
open**, and an **average severity** (rounded mean rank → label). No resolution
state exists in the read-only layer, so `resolved = 0` and `active = total`.

## Watchlist model

`Watchlist = { id, name, count, activeAlerts, severity, description, category?,
recentReports[], sourceContribution[] }`. Eight watchlists: **High Risk Narratives**
(critical+high), **Emerging Narratives** (detector count), and one per public
category (Recruitment, Influence, Misinformation, Propaganda, Extremism, Other).
Counts come from category activity / risk facets; recent reports and source
contribution are sliced from the cached library/source data.

**Emerging detection (Part 4):** signal-volume surge (>30% period-over-period),
publication burst, category concentration (>50% of activity), and source
concentration (>40% of signals from one source) — each shown with its trigger
reason and supporting counts. None firing → empty state.

---

## Performance

- Four cached reads via `Promise.all` (shared `public-intelligence` cache tag) →
  ≤1 DB pass per cache window. No new queries, no N+1. Alert generation is pure
  in-memory composition.
- Server-rendered panels; the only client island is the watchlist registry + drawer
  (detail embedded in props). No client-bundle growth from server libs.

---

## Public safety

- Aggregate/derived data only; alerts reuse the public-safe activity feed
  (publication titles, signal categories, generic source/review events) — no PII,
  reviewer identities, or internal notes.
- **No notification sending** of any kind; the notification channels panel is a
  reserved, disabled placeholder. Graceful empty states throughout.

---

## Files

**Added**
- `apps/web/lib/alerts-intelligence.ts` — alert/watchlist/severity/emerging engine (composed, read-only).
- `apps/web/components/alerts/WatchlistRegistry.tsx` — watchlist cards + detail drawer (client).
- `apps/web/components/alerts/panels.tsx` — exec summary, alert health, severity, alert feed, emerging, source/review alerts, notification prep.
- `docs/PHASE_51_ALERTS_AND_WATCHLISTS.md` — this report.

**Changed**
- `apps/web/app/dashboard/watchlists/page.tsx` — added the read-only alerting surface above the preserved Phase 7 custom-watchlist workflow.

---

## Verification
- Typecheck (`apps/web`): **clean** (exit 0).
- Full test suite (chunked, summed): **2668 / 2668 pass, 0 fail**.
- `next build`: **exit 0, "Compiled successfully"**; `ƒ /dashboard/watchlists` → 4.03 kB (162 kB first load).
